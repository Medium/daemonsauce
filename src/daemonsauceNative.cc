// Copyright 2012 The Obvious Corporation.

#include <node.h>
#include <v8.h>

#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

using namespace v8;

#define DEV_NULL "/dev/null"

/**
 * Helper to schedule an exception with the given message and return
 * undefined.
 */
static Handle<Value> scheduleException(const char* message) {
    Local<Value> exception = Exception::Error(String::New(message));
    ThrowException(exception);
    return Undefined();
}

Handle<Value> CloseStdin(const Arguments& args) {
    freopen(DEV_NULL, "r", stdin);
}

Handle<Value> CloseStdout(const Arguments& args) {
    freopen(DEV_NULL, "w", stdout);
}

Handle<Value> CloseStderr(const Arguments& args) {
    freopen(DEV_NULL, "w", stderr);
}

Handle<Value> ReopenStdout(const Arguments& args) {
    HandleScope scope;

    Local<String> name = args[0]->ToString();
    if (name.IsEmpty()) {
        return scheduleException("Not a string.");
    }

    String::Utf8Value data(name);

    if (freopen(*data, "a", stdout) == NULL) {
        return scheduleException("Failed to reopen stdout.");
    }

    return Undefined();
}

Handle<Value> ReopenStderr(const Arguments& args) {
    HandleScope scope;

    Local<String> name = args[0]->ToString();
    if (name.IsEmpty()) {
        return scheduleException("Not a string.");
    }

    String::Utf8Value data(name);

    if (freopen(*data, "a", stderr) == NULL) {
        return scheduleException("Failed to reopen stderr.");
    }

    return Undefined();
}

/**
 * This is adapted from the daemon.node module:
 * 
 *     https://github.com/indexzero/daemon.node
 *
 * That code is licensed under the MIT License, but also this code isn't
 * just a straight copy anyway.
 */
Handle<Value> AcquireLock(const Arguments& args) {
    HandleScope scope;

    Local<String> name = args[0]->ToString();
    if (name.IsEmpty()) {
        return scheduleException("Not a string.");
    }

    String::Utf8Value data(name);
  
    int lockFd = open(*data, O_RDWR | O_CREAT | O_TRUNC, 0640);
    if (lockFd < 0) {
        return scheduleException("Failed to open lock file");
    }

    if (lockf(lockFd, F_TLOCK, 0) < 0) {
        return False();
    }

    char *pidStr;
    int pidLen = asprintf(&pidStr, "%d", getpid());

    if (pidLen < 0) {
        // This shouldn't happen, and is probably a sign of
        // catastrophic failure, but we'll attempt to deal.
        return scheduleException("Failed make pid string");
    }

    write(lockFd, pidStr, pidLen);
    fsync(lockFd);
  
    return True();
}

void init(Handle<Object> target) {
    target->Set(String::NewSymbol("closeStdin"),
                FunctionTemplate::New(CloseStdin)->GetFunction());
    target->Set(String::NewSymbol("closeStdout"),
                FunctionTemplate::New(CloseStdout)->GetFunction());
    target->Set(String::NewSymbol("closeStderr"),
                FunctionTemplate::New(CloseStderr)->GetFunction());
    target->Set(String::NewSymbol("reopenStdout"),
                FunctionTemplate::New(ReopenStdout)->GetFunction());
    target->Set(String::NewSymbol("reopenStderr"),
                FunctionTemplate::New(ReopenStderr)->GetFunction());
    target->Set(String::NewSymbol("acquireLock"),
                FunctionTemplate::New(AcquireLock)->GetFunction());
}

NODE_MODULE(daemonsauceNative, init)
