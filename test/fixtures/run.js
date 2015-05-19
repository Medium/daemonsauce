// Copyright 2015. A Medium Corporation.

var fs = require('fs')
var path = require('path')
var logFile = path.join(__dirname, 'log.txt')

var daemonsauce = require('../../lib/index')
daemonsauce.basicSetup()

var info = {
  name: 'Echo',
  version: 'v0.0.1',
  user: process.getuid(),
  baseDir: __dirname,
  dataDir: path.join(__dirname, 'data'),
  logDir: path.join(__dirname, 'log'),
  runDir: path.join(__dirname, 'run')
};

daemonsauce.usualSetup(info);
require('./echo.js')
