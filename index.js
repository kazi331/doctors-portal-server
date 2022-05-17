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

    // create service treatmet and check if service is already exist
    app.post("/booking", async (req, res) => {
      const booking = req.body;
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

    // get a single day services 
    app.get('/available', async(req, res) => {
      const date = req.query.date || 'May 16, 2022';
      // step 1: geta all services
      const services = await serviceCollection.find().toArray();
      // step 2 : get the booking of that day
      const query = {date: date}
      const bookings = await bookingCollection.find(query).toArray();


      res.send(bookings)
    })

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
