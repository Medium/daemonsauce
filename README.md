[![build status](https://secure.travis-ci.org/Obvious/daemonsauce.png)](http://travis-ci.org/Obvious/daemonsauce)
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


Building and Installation
-------------------------

```shell
npm install daemonsauce
```

Or grab the source and

```shell
node-waf configure build
```


Testing
-------

It is unfortunately not easy to put together a generic automated test
for the functionality in this module, such that it can be expected to
work in (that is, to successfully test) the wide range of environments
in which it is potentially deployed. In practice, this module has been
tested by a lot of trial and error, along with a fair amount of
one-off poking and prodding.

The author would love some input (where "input" means "Pull requests,
please!") on how to remedy this situation.


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

* `rootMain` -- If you define this to to be a file name (relative to the
  application directory), then it will be loaded and run (via
  `require()`) as the root userid (assuming the app started out
  running as root), just before Daemon Sauce drop privileges.

* `daemonUser` -- Use this to specify the userid (by name) to run the main
  application as. If unset, it defaults to the product name (`name` in
  the `package.json` file.)

* `daemonGroup` -- Use this to specify the groupid (by name) to run the main
  application as. If unset, it defaults to the userid (which may itself
  just be the default of the product name).

If you want to make life hard on yourself, there are also separate
methods to handle most of the various bits and pieces. UTSL for
details.

The one requirement for your commandline arguments is that you pass in
a `--daemon` argument to kick things off. When running normally (that
is, to cause it to create a real daemon in the usual fork/detach
style), pass `--daemon=parent`. When running in a development
environment, pass `--daemon=foreground` to cause the process to remain
an attached foreground process (and not mess with log or lock files,
either). If you are trying to debug what happens as the child process
starts, make yourself a root shell (e.g., `sudo su`), and try running
the daemon with `--daemon=child`. In the last case, note that the
system will close and/or redirect stdio pretty early.

You should expect to see `--daemon=child` in the arguments to your
application when it is running "for real" (as opposed to in one of
the set-up phases).


Directory Setup Details
-----------------------

The suggested/example `bin-script` file assumes that a "normal"
installation of a daemon is done in `/usr/...`, with associated data
in `/var/...` (where the `...`s are the same). When you install a
daemon, it is probably a good idea to create that `/var` directory at
the same time, assigning it a user and group that match the product
name or explicit `daemonUser` / `daemonGroup`, as appropriate.

If the daemon is run from a directory that's not under `/usr`, it
assumes it is in a development environment, and instead of looking for
a `var/...` directory, it assumes that the data lives in a `data`
subdirectory of the installation.


Logging Details
---------------

This section only applies when running as a daemon (as opposed to in
the foreground for development).

Once set up, `console.log()` and most of the other standard logging
functions will write to a file called `error.log` in the specified
logging directory. The one exception is that `console.info()` will
emit a log message to the syslog. (You can find the syslog in the
file `/var/log/messages` on many Linux distros and in the file
`/var/log/system.log` on OS X.)

Daemon Sauce also arranges to rotate the `error.log` file once a day
(at around midnight UTC), renaming the file based on the date that it
covered, and recreating / reopening the "plain" `error.log` to cover
the upcoming day.

The idea behind all this is *not* that `error.log` or the syslog are
great places to log to, but rather they are *acceptable* places to log
to as a fallback, when it is too early in a daemon's life to have
anything more durable or structured to use. It is also the case that
Node (in 0.6.*, as of this writing) will always write "uncaught
exception" messages to the underlying stderr stream, as the process is
dying. At least `error.log` is a place where these messages can be
found, when doing forensics.


Lockfile Details
----------------

This section only applies when running as a daemon (as opposed to in
the foreground for development).

A lockfile is used to ensure that only one instance of a daemon is
running at any given time.

In this case, the lockfile is named `product-name.pid` and placed in
the specified run directory. During startup, if it turns out that
another process has locked the lockfile (this uses the POSIX call
`lockf()`), this will cause the new process to exit after writing a
message to that effect to the syslog.

If the lock is successful, then the "winning" process writes out its
process id to the lockfile, which makes it convenient to inspect,
e.g. by `cat product-name.pid` from a console.


Using Upstart
-------------

The file `upstart.conf` in the example directory is a simple example
of how one might hook up a service that uses Daemon Sauce.


To Do
-----

* Find something to do!


Contributing
------------

Questions, comments, bug reports, and pull requests are all welcome.
Submit them at [the project on GitHub](https://github.com/Obvious/daemonsauce/).

Bug reports that include steps-to-reproduce (including code) are the
best. Even better, make them in the form of pull requests that add
tests (which, yes, is a hard nut to crack in this case). Thanks!


Author
------

[Dan Bornstein](https://github.com/danfuzz)
([personal website](http://www.milk.com/)), supported by
[The Obvious Corporation](http://obvious.com/).


License
-------

Copyright 2012 [The Obvious Corporation](http://obvious.com/).

Licensed under the Apache License, Version 2.0. 
See the top-level file `LICENSE.txt` and
(http://www.apache.org/licenses/LICENSE-2.0).
