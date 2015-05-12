// Copyright 2012 The Obvious Corporation.

#include <node.h>
#include <nan.h>
#include <v8.h>

#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

using namespace v8;

#define DEV_NULL "/dev/null"

NAN_METHOD(CloseStdin) {
    NanScope();
    freopen(DEV_NULL, "r", stdin);
}

NAN_METHOD(CloseStdout) {
    NanScope();
    freopen(DEV_NULL, "w", stdout);
}

NAN_METHOD(CloseStderr) {
    NanScope();
    freopen(DEV_NULL, "w", stderr);
}

NAN_METHOD(ReopenStdout) {
    NanScope();

    Local<String> name = args[0]->ToString();
    if (!args[0]->IsString() || name.IsEmpty()) {
        NanThrowError("Not a string.");
        NanReturnUndefined();
    }

    String::Utf8Value data(name);

    if (freopen(*data, "a", stdout) == NULL) {
        NanThrowError("Failed to reopen stdout.");
        NanReturnUndefined();
    }

    NanReturnUndefined();
}

NAN_METHOD(ReopenStderr) {
    NanScope();

    Local<String> name = args[0]->ToString();
    if (!args[0]->IsString() || name.IsEmpty()) {
        NanThrowError("Not a string.");
        NanReturnUndefined();
    }

    String::Utf8Value data(name);

    if (freopen(*data, "a", stderr) == NULL) {
        NanThrowError("Failed to reopen stderr.");
        NanReturnUndefined();
    }

    NanReturnUndefined();
}

/**
 * This is adapted from the daemon.node module:
 *
 *     https://github.com/indexzero/daemon.node
 *
 * That code is licensed under the MIT License, but also this code isn't
 * just a straight copy anyway.
 */
NAN_METHOD(AcquireLock) {
    NanScope();

    Local<String> name = args[0]->ToString();
    if (!args[0]->IsString() || name.IsEmpty()) {
        NanThrowError("Not a string.");
        NanReturnUndefined();
    }

    String::Utf8Value data(name);

    int lockFd = open(*data, O_RDWR | O_CREAT, 0640);
    if (lockFd < 0) {
        NanThrowError("Failed to open lock file");
        NanReturnUndefined();
    }

    if (lockf(lockFd, F_TLOCK, 0) < 0) {
        NanReturnValue(false);
    }

    char *pidStr;
    int pidLen = asprintf(&pidStr, "%d", getpid());

    if (pidLen < 0) {
        // This shouldn't happen, and is probably a sign of
        // catastrophic failure, but we'll attempt to deal.
        NanThrowError("Failed make pid string");
        NanReturnUndefined();
    }

    write(lockFd, pidStr, pidLen);
    free(pidStr);

    ftruncate(lockFd, pidLen);
    fsync(lockFd);

    NanReturnValue(true);
}

void init(Handle<Object> target) {
    target->Set(NanNew<String>("closeStdin"),
        NanNew<FunctionTemplate>(CloseStdin)->GetFunction());
    target->Set(NanNew<String>("closeStdout"),
        NanNew<FunctionTemplate>(CloseStdout)->GetFunction());
    target->Set(NanNew<String>("closeStderr"),
        NanNew<FunctionTemplate>(CloseStderr)->GetFunction());
    target->Set(NanNew<String>("reopenStdout"),
        NanNew<FunctionTemplate>(ReopenStdout)->GetFunction());
    target->Set(NanNew<String>("reopenStderr"),
        NanNew<FunctionTemplate>(ReopenStderr)->GetFunction());
    target->Set(NanNew<String>("acquireLock"),
        NanNew<FunctionTemplate>(AcquireLock)->GetFunction());
}

NODE_MODULE(daemonsauceNative, init)
