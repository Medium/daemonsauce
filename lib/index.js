// Copyright 2012 The Obvious Corporation.

/*
 * Daemon Sauce: Just sprinkle it on your Node program, to make it a proper
 * *nix daemon.
 *
 * This assumes that the original script gets called with at least one
 * option of the form --daemon=<mode>, where mode is one of "parent"
 * "child" or "foreground". When running normally, it should be
 * "parent." When running in the foreground (e.g.  during
 * development), it should be "foreground." The "child" mode is used
 * internally (for the spawned child process).
 */

/*
 * Modules used
 */

"use strict";

var child_process = require("child_process");
var daemon        = require("daemon");
var fs            = require("fs");
var posix         = require("posix");
var util          = require("util");


/*
 * Module-local variables
 */

/** the product name; used in logging */
var productName = "daemon";

/** what mode is this process in; one of: "child" "foreground" */
var mode = undefined;

/** directory for "run" files (notably, the pid lockfile) */
var runDir = undefined;

/** file to log to */
var logFile = undefined;

/** the full product info */
var theInfo = { name: productName };


/*
 * Helper functions
 */

/**
 * Heuristically sets the product name based on the given script name, by
 * extracting the base file name (excluding directories and dot-suffixes).
 */
function setProductNameFromScript(name) {
    var match = name.match(/^.*\/([^\/.]+)[^\/]*$/);
    
    if (!match || (match[1].length === 0)) {
	// The name isn't of the usual form. Just use the whole name.
	setProductName(name);
    } else {
	setProductName(match[1]);
    }
}

/**
 * Parses the given commandline arguments (process.argv if left
 * unspecified), determining what mode the process is to be in.  This
 * returns a map of the form { mode: <mode>, exec: <executable-name>,
 * script: <file-name>, argv: <cooked-argv> }, where mode is one of {
 * "parent", "child", "foreground" }, exec and script are the original
 * two arguments, and argv is an array of the arguments, excluding the
 * one that was used to determine parent-vs-child.
 *
 * This throws an exception if there is no mode argument present.
 */
function parseDaemonArguments(argv) {
    if (argv === undefined) {
	argv = process.argv;
    }

    if (argv.length < 3) {
	throw new Error("Too few arguments for daemon invocation");
    }

    var exec = argv[0];
    var script = argv[1];
    argv = argv.slice(2);

    // Scan for a --daemon argument, and note its index and value.

    var modeIndex = -1;
    var mode = undefined;

    for (var i = 0; i < argv.length; i++) {
	var arg = argv[i];
	if ((arg === "--") || (arg.length === 0) || (arg.charAt(0) !== "-")) {
	    break;
	}
	if (arg.search(/^--daemon=/) === 0) {
	    modeIndex = i;
	    mode = arg.slice(9);
	    break;
	}
    }

    // Validate.

    if (modeIndex < 0) {
        // Assume missing means "foreground".
        mode = "foreground";
    }

    switch (mode) {
        case "parent":
        case "child":
        case "foreground": {
	    // It's a valid value.
	    break;
	}
        default: {
	    throw new Error("Invalid --daemon option: " + mode);
	}
    }

    // Excise the --daemon argument from argv.
    if (modeIndex >= 0) {
        argv.splice(modeIndex, 1);
    }

    return {
	mode:   mode,
	exec:   exec,
	script: script,
	argv:   argv
    };
}

/**
 * Logs to the file indicated by logFile, or to stderr if logFile hasn't
 * yet been set.
 */
function logToFile(/*arg, ...*/) {
    var string = util.format.apply(this, arguments) + "\n";

    if (logFile === undefined) {
	process.stderr.write(string);
    } else {
	fs.write(logFile, string);
    }
}

/**
 * Logs to the the syslog.
 */
function logToSyslog(/*arg, ...*/) {
    posix.syslog("notice", util.format.apply(this, arguments));
}

/**
 * Make a directory (and its superdirectories) if it doesn't already exist.
 */
function mkdirsIfNeeded(dir) {
    try {
	var stat = fs.statSync(dir);
    } catch (ex) {
	if (ex.code == "ENOENT") {
	    var upDir = dir.match(/^(.*)\/[^\/]*$/);
	    if (upDir && upDir.length > 0) {
		mkdirsIfNeeded(upDir[1]);
	    }
	    fs.mkdirSync(dir);
	} else {
	    throw ex;
	}
    }
}


/*
 * Exported methods
 */

/**
 * Set the product name. This is used when logging.
 */
function setProductName(name) {
    productName = name;
    theInfo.name = name;
}

/**
 * Set the logging directory. This is (unsurprisingly) used when logging.
 */
function setLogDir(path) {
    if (logFile !== undefined) {
	fs.closeSync(logFile);
    }

    mkdirsIfNeeded(path);
    logFile = fs.openSync(path + "/error.log", "a");
}

/**
 * Set the run directory. This is notably used to hold a process pid
 * lockfile.
 */
function setRunDir(path) {
    mkdirsIfNeeded(path);
    runDir = path;
}

/**
 * Take appropriate daemon setup action, based on the --daemon option
 * in the given commandline arguments (which default to process.argv
 * if left unspecified). This function should be called once, early on
 * in the life of a script.
 * 
 * This function only returns in a child or foreground process. In a
 * parent process, this function is responsible for spawning the child
 * and then exiting.
 *
 * The return value is the given (or process) arguments, minus the one
 * that specified the daemon mode.
 */
function basicSetup(argv) {
    function makeArgv() {
	return [ parsedArgs.exec, parsedArgs.script ].concat(parsedArgs.argv);
    }

    var parsedArgs = parseDaemonArguments(argv);
    mode = parsedArgs.mode; // Set the module-scope mode.
    setProductNameFromScript(parsedArgs.script);

    switch (mode) {
        case "parent": {
	    // We are the parent process. Spawn a child, telling it to
	    // run Node with the same script, but with the child daemon
	    // command.
	    var childArgs = [ "--daemon=child" ].concat(parsedArgs.argv);
	    var childProcess = child_process.fork(
		parsedArgs.script,
		childArgs,
		{ cwd: "/", 
		  env: process.env, // TODO: Allow this to be passed in?
		  setsid: true
		});
	    process.exit(1);
	    throw new Error("Shouldn't happen");
	}
        case "child": {
	    // We are the child process. Reopen std* to /dev/null, and
	    // return the cooked argv.
	    daemon.closeStdio();
	    return makeArgv();
	}
        case "foreground": {
	    // We are a foreground process. Just return the cooked argv.
	    return makeArgv();
	}
    }
}

/**
 * Set up the logging environment. This only takes any action when
 * running in a daemon child process. This also needs to be done along
 * with a call to setLogDir(). 
 *
 * This replaces the logging methods of the global console
 * object. Most of the logging methods will write to an error log,
 * except for info(), which will emit syslog entries.
 */
function loggingSetup() {
    if (mode !== "child") {
	return;
    }

    // Set up for using syslog.
    posix.openlog(productName, {cons: true, pid: true}, "daemon");

    // What does "dir" mean? This is more or less copied from
    // console.js in the Node core.
    function dir(object) {
	console.log(util.inspect(object));
    }

    console.log = logToFile;
    console.info = logToSyslog;
    console.warn = logToFile;
    console.error = logToFile;
    console.dir = dir;
}

/**
 * Acquire the process lock. This will either succeed in locking or will
 * exit the process after logging the failure.
 *
 * This may only be called after setting the run directory.
 *
 * This method only takes action when running in a daemon child.
 */
function acquireLock() {
    if (mode !== "child") {
	return;
    }

    var lockFile = runDir + "/" + productName + ".pid";

    if (!daemon.lock(lockFile)) {
        console.info("Could not acquire lockfile: " + lockFile);
        process.exit(1);
    }
}

/**
 * Set user and group ids, based on the product name. This does nothing if
 * it's not possible to set the ids (e.g. id doesn't exist or not running
 * as root).
 *
 * This method only takes action when running in a daemon child.
 */
function setUserAndGroup() {
    if (mode !== "child") {
	return;
    }

    try {
	process.setgid(productName);
	process.setuid(productName);
    } catch (ex) {
	// Ignore it.
    }
}

/**
 * Perform the "usual" daemon setup, based on the given info, which
 * must at least contain bindings for `{ name, logDir, runDir }`. Other
 * info is okay too, and is just returned directly by `getInfo()`.
 */
function usualSetup(info) {
    var name = info.name;
    var logDir = info.logDir;
    var runDir = info.runDir;

    if (!(name && logDir && runDir)) {
        throw new Error("Missing setup info");
    }

    theInfo = info;
    setProductName(name);
    setUserAndGroup();
    setRunDir(runDir);
    setLogDir(logDir);
    loggingSetup();
    acquireLock();
}

/**
 * Get the info previously passed to `usualSetup()1.
 */
function getInfo() {
    return theInfo;
}

module.exports = {
    acquireLock:     acquireLock,
    basicSetup:      basicSetup,
    getInfo:         getInfo,
    loggingSetup:    loggingSetup,
    setLogDir:       setLogDir,
    setRunDir:       setRunDir,
    setProductName:  setProductName,
    setUserAndGroup: setUserAndGroup,
    usualSetup:      usualSetup
};
