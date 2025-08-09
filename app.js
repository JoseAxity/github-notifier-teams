const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
// Recomendacion de render: Usa variables de entorno para la configuración
const port = process.env.PORT || 3000
const GITHUB_SECRET = process.env.GITHUB_SECRET; // Configura tu secreto

app.use(bodyParser.json());

function verifySignature(req, res, buf, encoding) {
  const signature = req.headers['x-hub-signature-256'];
  const hmac = crypto.createHmac('sha256', GITHUB_SECRET);
  const digest = 'sha256=' + hmac.update(buf).digest('hex');
  if (signature !== digest) {
    throw new Error('Invalid signature.');
  }
}

app.post('/webhook', bodyParser.json({ verify: verifySignature }), (req, res) => {
  const event = req.headers['x-github-event'];
  const body = req.body;

  if (event === 'pull_request' && body.action === 'opened') {

    // Extraer información del repositorio   
    const repoName = body.repository && body.repository.name;
    console.log('Nombre repositorio:', repoName);

    if (repoName && (repoName.includes('WF_') || repoName.includes('ORA_'))) {
        // Aquí puedes manejar el evento de Pull Request abierto    
        const pr = body.pull_request;
        // Aquí llamarás a Teams
        sendTeamsNotification(pr);
    }    
  }
  res.status(200).end();
});

app.get('/', (req, res) => {
  res.send('Version 1.0.0');
  console.log('Root path accessed');
});

function sendTeamsNotification(pr) {
  // Lógica para enviar mensaje a Teams aquí
  // Ejemplo básico:

  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

  const message = {
    text: `Nuevo Pull Request: [${pr.title}](${pr.html_url}) creado por ${pr.user.login}`
  };

  axios.post(webhookUrl, message)
    .then(() => console.log('Mensaje enviado a Teams'))
    .catch(err => console.error('Error enviando mensaje a Teams', err));
}

app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});
