const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;

// mongodb config
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wd208.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
// main routes ///////
async function run() {
  try {
    await client.connect();
    const serviceCollection = client
      .db("treatmentService")
      .collection("service");
    const bookingCollection = client.db("consultation").collection("booking");

    //   find all services from db
    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // create service treatmet
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patientName: booking.patientName,
      };
      const exist = await bookingCollection.findOne(query);
      if (exist) {
        return res.send({ success: false, booking: exist });
      } else {
        const result = await bookingCollection.insertOne(booking);
        res.send({ success: true, result: result });
      }
    });
  } finally {
    // client.close();
  }
}
run().catch(console.dir);

// Home  route
app.get("/", (req, res) => {
  res.send("Server is running fine  ");
});
// listen to port
app.listen(port, () => {
  console.log(`Port running at http://localhost:${port}`);
});
