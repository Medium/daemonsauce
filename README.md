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

The easiest way to make use of this is by using the provided wrapper
`bin-script` (in the `examples` directory). Arrange your application files
so that the wrapper is in a `bin` directory, and next to `bin` is
a directory containing your main application. Rename the wrapper script
to have the same name as the main application directory. For example:

```
my-application/
    bin/
        server <-- the example bin-script
    server/
        package.json
        main.js
        ...
```

If you do this, then the script will take care of all the forking and
setting of userids, and so on. It keys off of a few additional
properties that can be defined in your `package.json` file:

* rootMain -- If you define this to a file name (relative to the application
  directory), then it will be loaded and run (via `require()`) as the
  root userid (assuming the app started out running as root), just before
  the wrapper script calls into Daemon Sauce to drop privileges.
* daemonUser -- Use this to specify the userid (by name) to run the main
  application as. If unset, it defaults to the product name (`name` in
  the `package.json` file.)
* daemonGroup -- Use this to specify the groupid (by name) to run the main
  application as. If unset, it defaults to the userid.

If you want to make life hard on yourself, there are also separate
methods to handle the various bits and pieces. UTSL for details.

The one requirement for your commandline arguments is that you pass in
a `--daemon` argument to kick things off. When running
normally (that is, to cause it to create a real daemon), pass
`--daemon=parent`. When running in a development environment,
pass `--daemon=foreground` to cause the process to remain an attached
foreground process (and not mess with log or lock files, either).

You should expect to see `--daemon=child` in the arguments to your
application when it is running "for real" (as opposed to in one of
the set-up phases).


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
