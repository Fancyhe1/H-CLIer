module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.json({
    status: 'ok',
    service: 'hclier-license-server',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
};
