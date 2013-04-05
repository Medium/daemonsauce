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

var assert        = require("assert");
var child_process = require("child_process");
var fs            = require("fs");
var path          = require("path");
var posix         = require("posix");
var util          = require("util");

var daemonsauceNative = require("../build/Release/daemonsauceNative");


/*
 * Module-local variables
 */

/** the number of milliseconds in a day */
var MSEC_PER_DAY =
    1000 * // msec per second
    60 *   // seconds per minute
    60 *   // minutes per hour
    24;    // hours per day

/** the error log prefix */
var ERROR_LOG_PREFIX = "error";

/** the product name; used in logging */
var productName = "daemon";

/** what mode is this process in; one of: "parent" "child" "foreground" */
var mode = undefined;

/** directory for "run" files (notably, the pid lockfile) */
var runDir = undefined;

/** directory for log files */
var logDir = undefined;

/** name of the file currently being logged to */
var logFileName = undefined;

/** file to log to */
var logFile = undefined;

/** the full product info */
var theInfo = { name: productName };


/*
 * Helper functions
 */

/**
 * Make a date (plus optional time) string for the given time.
 */
function dateString(when, includeTime) {
    var result = [];
    when = new Date(when);

    var year = when.getUTCFullYear();
    var month = when.getUTCMonth() + 1; // +1 because it's zero-based
    var day = when.getUTCDate();
    result.push(year, "-", zeroPad(month), "-", zeroPad(day));

    if (includeTime) {
        var hours = when.getUTCHours();
        var mins = when.getUTCMinutes();
        var secs = when.getUTCSeconds();
        result.push(" ",
                    zeroPad(hours), ":", zeroPad(mins), ":", zeroPad(secs));
    }

    return result.join("");

    function zeroPad(value) {
        var str = "" + value;
        return (str.length == 1) ? ("0" + str) : str;
    }
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
    var string = util.format.apply(this, arguments);
    var result = [];

    result.push("[", dateString(Date.now(), true), "] ", string);

    if (string[string.length - 1] !== "\n") {
        result.push("\n");
    }

    string = result.join("");

    if (logFile === undefined) {
        process.stderr.write(string);
    } else {
        fs.write(logFile, string);
    }
}

/**
 * Open (or reopen) the designated error log file.
 */
function openLogFile() {
    if (logFile !== undefined) {
        fs.closeSync(logFile);
    }

    assert(logDir);
    logFileName = path.join(logDir, ERROR_LOG_PREFIX + ".log");
    mkdirsIfNeeded(logDir);

    try {
        logFile = fs.openSync(logFileName, "a");
    } catch (ex) {
        // Attempt to log the problem.
        console.log(ex.stack);
        console.info(ex.stack);
        throw ex;
    }

    fs.writeSync(logFile, "\n\n");
    logToFile("Restarting log.");

    if (mode === "child") {
        // Do "fallback" logging setup, which is to log stdout and
        // stderr to a file. Some time after this, the higher layer of
        // logging could (and perhaps should) end up getting
        // redirected, but some things (such as, notably, Node's
        // internal "death throes" error reporting) only ever use the
        // underlying stdio descriptors.
        daemonsauceNative.reopenStderr(logFileName);
        daemonsauceNative.reopenStdout(logFileName);
    }
}

/**
 * Set up error log rotation. This aims to rename the active log to
 * reflect the day it covers, once a day, and recreate a generically-named
 * log for the future.
 */
function startLogRotation() {
    // Just call on arrangeCallback(), immediately below, to kick things
    // off.
    arrangeCallback();

    function arrangeCallback() {
        // Rather than using setInterval(), which makes no guarantee
        // about how the callback may (or may not) skew over time, we
        // calculate the time for the next callback explicitly.
        var now = Date.now();

        var startOfTomorrow = new Date(now + MSEC_PER_DAY);
        startOfTomorrow.setUTCHours(0);
        startOfTomorrow.setUTCMinutes(0);
        startOfTomorrow.setUTCSeconds(30); // Allow for a little slop.
        startOfTomorrow.setUTCMilliseconds(0);

        setTimeout(rotateCallback, startOfTomorrow - now);
    }

    function rotateCallback() {
        if (logDir && logFileName && fs.existsSync(logFileName)) {
            logToFile("Rotating log.");
            doRename();
        }

        if (logDir) {
            openLogFile();
        }

        arrangeCallback();
    }

    function doRename() {
        var yesterday = Date.now() - MSEC_PER_DAY;
        var baseName = ERROR_LOG_PREFIX + "-" + dateString(yesterday);
        var fileName;

        // Find an unused name to rename the log to. This is done just
        // in case the log ends up getting rotated more than once in a
        // given day.
        for (var i = 0; /*empty*/; i++) {
            fileName = baseName;
            if (i !== 0) {
                fileName += "-" + i;
            }
            fileName = path.join(logDir, fileName + ".log");
            if (!fs.existsSync(fileName)) {
                break;
            }
        }

        fs.renameSync(logFileName, fileName);
    }
}

/**
 * Logs to the the syslog.
 */
function logToSyslog(/*arg, ...*/) {
    posix.syslog("notice", util.format.apply(this, arguments));
}

/**
 * Run the indicated module, with the expectation that it's
 * being done before dropping privileges.
 */
function runRootMain(rootMainFile) {
    // Do a generic try-catch, because at this point, the expectation
    // is that stdio is closed, and there's not yet a designated error
    // file. We may in fact (probably do) already have enough info to
    // create that file, but we're better off waiting until we've
    // dropped privileges, so that the permissions are all hunky-dorey.
    //
    // Errors in the root main module should be few and far between,
    // but in case something goes wrong, we still have the out of
    // using the syslog, which is what we do in the catch clause.

    try {
        require(rootMainFile);
    } catch (ex) {
        logToSyslog("Exception while running root main:");
        logToSyslog(ex.stack);
        process.exit(1);
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
 * Set the run directory. This is notably used to hold a process pid
 * lockfile.
 */
function setRunDir(dir) {
    mkdirsIfNeeded(dir);
    runDir = dir;
}

/**
 * Set the logging directory. This is (unsurprisingly) used when logging.
 */
function setLogDir(dir) {
    logDir = dir;
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
            process.exit(0);
            throw new Error("Shouldn't happen");
        }
        case "child": {
            // We are the child process. Reopen std* to /dev/null, do
            // the fallback logging setup, and return the cooked argv.
            daemonsauceNative.closeStdin();
            daemonsauceNative.closeStdout();
            daemonsauceNative.closeStderr();
            basicLoggingSetup();
            return makeArgv();
        }
        case "foreground": {
            // We are a foreground process. Just return the cooked argv.
            return makeArgv();
        }
    }

    function makeArgv() {
        return [ parsedArgs.exec, parsedArgs.script ].concat(parsedArgs.argv);
    }
}

/**
 * Do the basic fallback logging setup, which is to log everything to
 * the syslog. This happens during `basicSetup()` which isn't in a
 * position to know where in the filesystem is okay to write to.
 */
function basicLoggingSetup() {
    console.log   = logToSyslog;
    console.info  = logToSyslog;
    console.warn  = logToSyslog;
    console.error = logToSyslog;
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

    openLogFile();
    startLogRotation();
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

    var lockFile = path.join(runDir, productName + ".pid");

    if (!daemonsauceNative.acquireLock(lockFile)) {
        console.info("Could not acquire lockfile: " + lockFile);
        process.exit(1);
    }
}

/**
 * Set user and group ids, based on the given info. It uses the
 * indicated `user` for the userid if supplied, defaulting to the
 * (product) `name` if not. `group` specifies the group id, which
 * defaults to the userid (which may itself have been defaulted to the
 * product name) if not specified.
 * 
 * This function does nothing if it's not possible to set the ids
 * (e.g. id doesn't exist or not running as root).
 *
 * This method only takes action when running in a daemon child.
 */
function setUserAndGroup(info) {
    if (mode !== "child") {
        return;
    }

    var user = info.user || info.name;
    var group = info.group || user;

    try {
        process.setgid(group);
        process.setuid(user);
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

    // This is the last opportunity to run something as the root user. If the
    // program specified a "rootMain" now's when it gets to run.

    if (info.rootMain) {
        runRootMain(info.rootMain);
    }

    setUserAndGroup(info);
    setLogDir(logDir);
    setRunDir(runDir);
    loggingSetup();
    acquireLock();
}

/**
 * Get the info previously passed to `usualSetup()`.
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
