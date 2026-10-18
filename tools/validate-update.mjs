import fs from 'node:fs';
const required=['package.json','server/package.json','client/package.json','server/src/app.js','client/src/App.jsx','tools/control-local.ps1','VERSION'];
for(const file of required){if(!fs.existsSync(file)) throw new Error(`Falta archivo requerido: ${file}`)}
for(const file of ['package.json','server/package.json','client/package.json']) JSON.parse(fs.readFileSync(file,'utf8'));
const version=fs.readFileSync('VERSION','utf8').trim();
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(version!==pkg.version) throw new Error(`VERSION (${version}) no coincide con package.json (${pkg.version}).`);
console.log(`Validación básica correcta. Versión ${version}.`);
