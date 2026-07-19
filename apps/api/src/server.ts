import { createApp } from './app.js';
const port=Number(process.env.API_PORT??3000); createApp().listen(port,()=>console.log(JSON.stringify({level:'info',message:'API started',port})));
