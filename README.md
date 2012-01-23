Daemon Sauce
============

Just add Daemon Sauce to your Node project, to make it a proper *nix
daemon. This is intended to help build daemons that play nice on machines
with services managed by something like (traditional) init(8) or Upstart.

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

The one requirement for your commandline arguments is that you pass in
a `--daemon` argument to kick things off. When running
normally (that is, to cause it to create a real daemon), pass
`--daemon=parent`. When running in a development environment,
pass `--daemon=foreground` to cause the process to remain an attached
foreground process (and not mess with log or lock files, either).

Logging Details
---------------

This section only applies when running as a daemon (as opposed to in
the foreground for development).

Once set up, `console.log()` and most of the other standard logging
functions will write to a file called `error.log` in the specified
logging directory. The one exception is that `console.info()` will
emit a log message to the syslog. (You can find the syslog in the
file `/var/log/messages` on many Linux distros and in the file
`/var/log/system.log` on OS X.

Lockfile Details
----------------

This section only applies when running as a daemon (as opposed to in
the foreground for development).

A lockfile is used to ensure that only one instance of a daemon is
running at any given time.

In this case, the lockfile is named `product-name.pid` and placed in
the specified run directory. During startup, if it turns out that
another process has locked the lockfile (this uses the POSIX call
`lockf()`), this will cause the new process to exit.

If the lock is successful, then the "winning" process writes out its
process id to the lockfile, which makes it convenient to inspect,
e.g. by `cat product-name.pid` from a console.

Using Upstart
-------------

The file `upstart.conf` in the example directory is a simple example
of how one might hook up a service that uses Daemon Sauce.
