'use strict';

const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = path.resolve(process.argv[2] || path.join(__dirname, '..', 'out'));
const relativeRequire = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function filesUnder(directory) {
	return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
		const child = path.join(directory, entry.name);
		return entry.isDirectory() ? filesUnder(child) : [child];
	});
}

// fs.existsSync() is insufficient on case-insensitive filesystems. Resolve each
// path component by exact comparison with the directory entry on disk instead.
function exactFileExists(file) {
	const parsed = path.parse(file);
	let resolved = parsed.root;
	for (const component of path.relative(parsed.root, file).split(path.sep)) {
		if (!fs.existsSync(resolved)) return false;
		const exactEntry = fs.readdirSync(resolved).find(entry => entry === component);
		if (!exactEntry) return false;
		resolved = path.join(resolved, exactEntry);
	}
	return fs.statSync(resolved).isFile();
}

function exactModuleExists(importer, specifier) {
	const modulePath = path.resolve(path.dirname(importer), specifier);
	const candidates = path.extname(modulePath)
		? [modulePath]
		: [`${modulePath}.js`, `${modulePath}.json`, path.join(modulePath, 'index.js'), path.join(modulePath, 'index.json')];
	return candidates.some(exactFileExists);
}

if (!fs.existsSync(outputDirectory)) {
	console.error(`Missing compiled output directory: ${outputDirectory}`);
	process.exitCode = 1;
} else {
	const errors = [];
	for (const file of filesUnder(outputDirectory).filter(file => file.endsWith('.js'))) {
		const source = fs.readFileSync(file, 'utf8');
		for (const match of source.matchAll(relativeRequire)) {
			if (!exactModuleExists(file, match[1])) {
				errors.push(`${path.relative(outputDirectory, file)} requires ${match[1]}, but no exact-case module exists`);
			}
		}
	}

	if (errors.length) {
		console.error(errors.join('\n'));
		process.exitCode = 1;
	} else {
		console.log('All compiled relative imports resolve with exact filename casing.');
	}
}
