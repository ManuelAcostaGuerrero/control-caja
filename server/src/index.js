import { app } from './app.js';
const port=Number(process.env.PORT||4100);
const server=app.listen(port,'0.0.0.0',()=>console.log(`Control Caja API: http://localhost:${port}`));
const close=()=>server.close(()=>process.exit(0));
process.on('SIGINT',close); process.on('SIGTERM',close);
