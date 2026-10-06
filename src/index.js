const app = require('./app');

const PORT = process.env.PORT || 5000;

(async () => {
  await app.listen(PORT);

  console.log(`GraphQL-Pokemon started on http://localhost:${PORT}/`);
  console.log(`Trace endpoint on http://localhost:${PORT}/trace`);
})();
