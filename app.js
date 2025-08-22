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
  res.send('Version 3.0.0');
  console.log('Root path accessed');
});

function sendTeamsNotification(pr) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

  // Obtener revisores
  const reviewers = pr.requested_reviewers?.map(r => r.login).join(', ') || 'N/A';
  const avatar = pr.user?.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';

  // Determinar color del mensaje según estado del PR
  let themeColor = '0078D7'; // Azul por defecto
  if (pr.state === 'closed' && pr.merged) themeColor = '28A745'; // Verde si mergeado
  else if (pr.state === 'closed') themeColor = 'D83B01'; // Rojo si cerrado

  const message = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "themeColor": themeColor,
    "summary": `Nuevo Pull Request en ${pr.base.repo.name}`,
    "sections": [
      {
        "activityTitle": `🚀 **Nuevo Pull Request**`,
        "activitySubtitle": `Repositorio: **${pr.base.repo.name}**`,
        "activityImage": avatar,
        "facts": [
          { "name": "Título:", "value": pr.title },
          { "name": "Autor:", "value": pr.user.login },
          { "name": "Branch:", "value": `${pr.head.ref} → ${pr.base.ref}` },
          { "name": "Estado:", "value": pr.state },
          { "name": "Revisores:", "value": reviewers },
          { "name": "Archivos modificados:", "value": `${pr.changed_files}` },
          { "name": "Commits:", "value": `${pr.commits}` },
          { "name": "Creado:", "value": new Date(pr.created_at).toLocaleString('es-MX') }
        ],
        "markdown": true
      }
    ],
    "potentialAction": [
      {
        "@type": "OpenUri",
        "name": "🔗 Ver Pull Request",
        "targets": [{ "os": "default", "uri": pr.html_url }]
      },
      {
        "@type": "OpenUri",
        "name": "📄 Ver Archivos",
        "targets": [{ "os": "default", "uri": `${pr.html_url}/files` }]
      },
      {
        "@type": "OpenUri",
        "name": "📜 Ver Commits",
        "targets": [{ "os": "default", "uri": `${pr.html_url}/commits` }]
      }
    ]
  };

  axios.post(webhookUrl, message)
    .then(() => console.log('✅ Mensaje enviado a Teams'))
    .catch(err => console.error('❌ Error enviando mensaje a Teams', err));
}

app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});
