const express = require("express");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { default: axios } = require("axios");

app.use(express.json());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.send("Hello From NUBNGPI Server");
});

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("Nubngpi_DB");
    const studentsCollection = db.collection("students");

    app.get("/test", async (req, res) => {
      res.send({ message: "OK" });
    });

    // post a student
    app.post("/students/post", async (req, res) => {
      try {
        const { name, img, roll } = req.body;
        if (!name || !img || !roll) {
          return res
            .status(404)
            .send({ message: "Student information is not valid" });
        }
        const newStudent = { name, img, roll };
        const result = await studentsCollection.insertOne(newStudent);
        res.send(result);
      } catch (err) {
        return res.status(500).send({ Error: "Internal Server Error" });
      }
    });

    app.get("/student/:roll", async (req, res) => {
      const { roll } = req.params;
      if (!roll) {
        return res.status(400).send({ message: "Roll number is required" });
      }

      try {
        const db_student = await studentsCollection.findOne({ roll: roll });
        const url = `https://btebresultszone.com/results/${roll}?regulation=2022`;

        const response = await axios.get(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Referer: "https://btebresultszone.com/", // Tells them you came from their homepage
          },
        });

        res.send({ html: response.data, db_info: db_student });
      } catch (err) {
        return res.status(500).send({ Error: "Internal Server Error" });
      }
    });
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// module.exports = app;
