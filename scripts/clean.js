'use strict';

const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = path.resolve(__dirname, '..', 'out');
fs.rmSync(outputDirectory, {recursive: true, force: true});
