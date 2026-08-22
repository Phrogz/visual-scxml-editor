import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const packagePath = path.join(repoRoot, 'package.json');

function readPackageJson() {
	const text = fs.readFileSync(packagePath, 'utf8');
	return JSON.parse(text);
}

test('SCXML inspector view is contributed as a webview in its own activity bar container', () => {
	const pkg = readPackageJson();

	const activityContainers = pkg?.contributes?.viewsContainers?.activitybar || [];
	const scxmlContainer = activityContainers.find(c => c.id === 'visual-scxml-editor');
	assert.ok(scxmlContainer, 'Expected SCXML activity bar container to be contributed');

	const views = pkg?.contributes?.views?.['visual-scxml-editor'] || [];
	const inspectorView = views.find(v => v.id === 'visual-scxml-editor.inspectorView');
	assert.ok(inspectorView, 'Expected SCXML Inspector view contribution to exist');
	assert.equal(inspectorView.type, 'webview', 'SCXML Inspector view must be a webview');
});
