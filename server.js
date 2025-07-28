const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const multer = require("multer");
const { Pool } = require("pg");

const app = express();
const PORT = 3001;

// === PostgreSQL Setup ===
const pool = new Pool({
  connectionString: "postgresql://moleculabDB_owner:npg_Hs3Kh1vzRjTq@ep-dark-wind-a8l4qj3l-pooler.eastus2.azure.neon.tech/moleculabDB?sslmode=require&channel_binding=require"
});

// === Middleware ===
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// === Multer for PDF uploads (in memory) ===
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // max 10MB
});

// === Routes ===

// Serve login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve admin page
app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Login Endpoint
app.post("/login", async (req, res) => {
  const { userid, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM Admins WHERE userid = $1", [userid]);
    if (result.rowCount === 0 || password !== result.rows[0].password) {
      return res.json({ success: false });
    }
    await pool.query("UPDATE Admins SET lastlogin = CURRENT_TIMESTAMP WHERE userid = $1", [userid]);
    return res.json({ success: true });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Get Admin Info
app.post("/get-admin-info", async (req, res) => {
  const { userid } = req.body;
  try {
    const result = await pool.query(
      "SELECT name, department, designation FROM Admins WHERE userid = $1",
      [userid]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching admin info:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === Upload Notice Endpoint ===
app.post("/upload-notice", upload.single("pdfFile"), async (req, res) => {
  console.log("UPLOAD:", { noticeName: req.body.noticeName, hasFile: !!req.file });
  const { noticeName } = req.body;
  if (!noticeName || !req.file) {
    return res.status(400).json({ error: "Missing title or PDF." });
  }
  const pdfBuffer = req.file.buffer;
  const insertRes = await pool.query(
    "INSERT INTO notices (noticeName, pdf, uploadDate) VALUES ($1, $2, NOW()) RETURNING id, noticeName, uploadDate",
    [noticeName, pdfBuffer]
  );
  res.status(201).json(insertRes.rows[0]);
});


// Serve PDF file from database
app.get("/notices/:id/pdf", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT noticeName, pdf FROM notices WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notice not found." });
    }
    const { noticeName, pdf } = result.rows[0];
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${noticeName}.pdf"`);
    res.send(pdf);
  } catch (error) {
    console.error("Error retrieving PDF:", error);
    res.status(500).json({ error: "Failed to retrieve PDF." });
  }
});

// List all notices (for frontend)
app.get("/notices", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, noticeName FROM notices ORDER BY uploadDate DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching notices:", error);
    res.status(500).json({ error: "Failed to fetch notices." });
  }
});


// Delete a notice
app.delete("/notices/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM notices WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notice not found." });
    }
    res.status(200).json({ message: `Notice with ID ${id} deleted.` });
  } catch (error) {
    console.error("Error deleting notice:", error);
    res.status(500).json({ error: "Failed to delete notice." });
  }
});

// === Start Server ===
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
