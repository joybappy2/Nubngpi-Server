const express = require("express");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const cors = require("cors");
const puppeteer = require("puppeteer");
// Add this right after your imports, before app.use()
const isDev = process.env.NODE_ENV !== "production";
const { MongoClient, ServerApiVersion } = require("mongodb");

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
    const db = client.db("Nubngpi_DB");
    const studentsCollection = db.collection("students");

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

      let browser = null;
      try {
        const db_student = await studentsCollection.findOne({ roll: roll });

        browser = await puppeteer.launch({
          headless: true, // Changed from "new" to true
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-blink-features=AutomationControlled",
          ],
          executablePath:
            process.env.PUPPETEER_EXECUTABLE_PATH ||
            (isDev ? puppeteer.executablePath() : "/usr/bin/chromium-browser"),
        });
        const page = await browser.newPage();

        const url = `https://btebresultszone.com/results/${roll}?regulation=2022`;

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        await page.waitForFunction(
          () => !document.body.innerText.includes("Loading page..."),
          { timeout: 15000 }
        );

        const studentData = await page.evaluate(() => {
          const lines = document.body.innerText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);

          if (
            document.body.innerText.includes("Sorry") ||
            document.body.innerText.includes("not found")
          ) {
            return null;
          }

          const getValueAfter = (label) => {
            const index = lines.findIndex(
              (l) => l.toLowerCase() === label.toLowerCase()
            );
            return index !== -1 && index + 1 < lines.length
              ? lines[index + 1]
              : null;
          };

          const allSemesters = [];
          const seenSemesters = new Set(); // To prevent duplicates like "3rd Semester" appearing twice

          lines.forEach((line, index) => {
            // 1. IMPROVED REGEX: Matches exactly "3rd Semester" but NOT "3rd Semester Results of..."
            const semesterMatch = line.match(/^(\d+(st|nd|rd|th)\sSemester)$/i);

            if (semesterMatch) {
              const semesterName = semesterMatch[1];

              // 2. DUPLICATE CHECK: If we already processed this semester, skip it
              if (seenSemesters.has(semesterName)) return;

              const segment = lines.slice(index, index + 15);
              const status = segment[1] || "N/A";

              // 3. JUNK FILTER: Skip if the status is a menu item or advertisement
              const junkKeywords = [
                "all institutes",
                "sponsored by",
                "hosted on",
                "results of",
              ];
              if (
                junkKeywords.some((keyword) =>
                  status.toLowerCase().includes(keyword)
                )
              )
                return;

              const gpaLabelIndex = segment.indexOf("GPA");
              let semesterObj = {
                semester: semesterName,
                status: status,
                gpa: gpaLabelIndex !== -1 ? segment[gpaLabelIndex + 1] : "N/A",
                failed_subjects: [],
              };

              if (
                status.toLowerCase().includes("failed") ||
                status.toLowerCase().includes("referred")
              ) {
                segment.forEach((sLine) => {
                  if (sLine.includes("Theory") || sLine.includes("Practical")) {
                    const subjectName = sLine
                      .replace(/Theory|Practical/g, "")
                      .trim();
                    if (
                      subjectName &&
                      !semesterObj.failed_subjects.includes(subjectName)
                    ) {
                      semesterObj.failed_subjects.push(subjectName);
                    }
                  }
                });
              }

              allSemesters.push(semesterObj);
              seenSemesters.add(semesterName); // Mark this semester as "done"
            }
          });

          return {
            roll:
              getValueAfter("Roll Number") ||
              lines.find((l) => /^\d{6}$/.test(l)),
            institute:
              getValueAfter("Institution") ||
              getValueAfter("Institute") ||
              "N/A",
            regulation:
              lines.find((l) => l === "2022" || l === "2016" || l === "2010") ||
              "N/A",
            technology: "Diploma In Engineering",
            results: allSemesters,
            latest_gpa: allSemesters.length > 0 ? allSemesters[0].gpa : "N/A",
            latest_status:
              allSemesters.length > 0 ? allSemesters[0].status : "N/A",
          };
        });

        if (!studentData) {
          return res
            .status(404)
            .send({ message: "Result not found or invalid roll" });
        }

        res.json({
          success: true,
          url: url,
          data: {
            name: db_student?.name || "Name",
            img: db_student?.img || "no image",
            ...studentData,
          },
        });
      } catch (error) {
        console.error("Scraping Error:", error);
        res.status(500).json({
          error: "Failed to fetch result",
          details: error.message,
        });
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    });

    //
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
