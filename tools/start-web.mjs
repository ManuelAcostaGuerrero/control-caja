import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../client');
await preview({root,preview:{host:'0.0.0.0',port:5174,strictPort:true}});
