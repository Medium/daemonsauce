// Copyright 2015. A Medium Corporation.

var Q = require('q')
var nodeunitq = require('nodeunitq')
var builder = new nodeunitq.Builder(exports)
var path = require('path')
var cp = require('child_process')
var fs = require('fs')

builder.add(function testMain(test) {
  var command = ['node', path.join(__dirname, 'fixtures', 'run.js'), '--daemon=parent'].join(' ')
  return Q.nfcall(cp.exec, command).then(function () {
    return Q.delay(1000)
  }).then(function () {
    var logs = String(fs.readFileSync(path.join(__dirname, 'fixtures', 'log', 'error.log')))
    test.ok(logs.indexOf('Print to stdout') != -1, logs)
    test.ok(logs.indexOf('Print to stderr') != -1, logs)

    var pid = String(fs.readFileSync(path.join(__dirname, 'fixtures', 'run', 'Echo.pid')))
    test.ok(pid && !isNaN(pid), 'Bad process id: ' + String(pid))

    process.kill(pid)
  })
})
