Daemon Sauce
============

Just add Daemon Sauce to your Node project, to make it a proper *nix
daemon.

The main things that this module does:

* Handle the creation of a disconnected child process.
* Manage a process lockfile.
* Redirect console to an error log and to the syslog (depending on the method).
* Setting user and group ids to drop privileges (when running as root).

Installation
------------

    npm install daemonsauce

or include it in your `package.json` file.

Usage
-----

The easiest way to make use of this is to call `basicSetup()` followed
by `usualSetup()` with your own commandline argument parsing in between.
Here's an example:

    var daemonsauce = require("./daemonsauce");
    var optimist = require("optimist");

    var argv = daemonsauce.basicSetup();

    argv = optimist
        .demand(["product-name", "log-dir", "run-dir"])
        .string(["product-name", "log-dir", "run-dir"])
        .parse(argv.slice(2));

    daemonsauce.usualSetup(
        argv["product-name"], argv["log-dir"], argv["run-dir"]);

There are also separate methods to handle the various bits and pieces.
UTSL for details.
