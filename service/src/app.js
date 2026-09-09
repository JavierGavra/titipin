const express = require('express');
const { loadConfig } = require('./config');
const { sendProblem, errorHandler } = require('./problem');
const requestRoutes = require('./routes/requests');
const assignmentRoutes = require('./routes/assignments');

const app = express();

// Pemeriksaan proses: tidak mengakses database.
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

// Membaca body JSON sebelum diteruskan ke route API.
app.use(express.json());

app.use('/v1/requests', requestRoutes);
app.use('/v1/assignments', assignmentRoutes);


// Dijalankan jika tidak ada route yang menangani request.
app.use((req, res) => {
  return sendProblem(res, 'resource-not-found');
});

// Penanganan error ditempatkan setelah seluruh route.
app.use(errorHandler);

if (require.main === module) {
  try {
    const config = loadConfig();

    const server = app.listen(config.port, config.host, () => {
      console.log(
        `Titipin service berjalan pada ${config.host}:${config.port}`
      );
    });

    server.on('error', (error) => {
      console.error(`Server gagal berjalan: ${error.message}`);
      process.exit(1);
    });
  } catch (error) {
    console.error(`Startup gagal: ${error.message}`);
    process.exit(1);
  }
}

module.exports = app;