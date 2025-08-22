const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;
const GITHUB_SECRET = process.env.GITHUB_SECRET; // Configura tu secreto
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL; // Webhook de Teams

// Middleware para verificar firma
function verifySignature(req, res, buf, encoding) {
  const signature = req.headers['x-hub-signature-256'];
  const hmac = crypto.createHmac('sha256', GITHUB_SECRET);
  const digest = 'sha256=' + hmac.update(buf).digest('hex');
  if (signature !== digest) {
    throw new Error('Invalid signature.');
  }
}

app.use(bodyParser.json({ verify: verifySignature }));

// Endpoint para recibir eventos de GitHub
app.post('/webhook', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const body = req.body;

    if (event === 'pull_request' && body.action === 'opened') {
      const repoName = body.repository?.name;
      if (repoName && (repoName.includes('demo-') || repoName.includes('WF_') || repoName.includes('ORA_'))) {
        const pr = body.pull_request;
        await sendTeamsNotification(pr);
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error('Error procesando webhook:', error);
    res.status(500).send('Error interno');
  }
});

// Endpoint raíz para verificar estado
app.get('/', (req, res) => {
  res.send('Webhook PR Notifications v4.0');
  console.log('Root path accessed');
});

// Enviar notificación a Microsoft Teams
async function sendTeamsNotification(pr) {
  const reviewers = pr.requested_reviewers?.map(r => r.login).join(', ') || 'N/A';
  const avatar = pr.user?.avatar_url || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';

  // Determinar color según estado del PR
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
        "activityTitle": `🚀 **Nuevo Pull Request Creado**`,
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

  try {
    await axios.post(TEAMS_WEBHOOK_URL, message);
    console.log(`✅ Notificación enviada a Teams para PR: ${pr.title}`);
  } catch (err) {
    console.error('❌ Error enviando mensaje a Teams:', err.response?.data || err.message);
  }
}

app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});
