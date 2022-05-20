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
      console.log("Service Route");
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

    // get a specific day services
    app.get("/available", async (req, res) => {
      // const date = req.query.date || "May 29, 2022";
      const date = req.query.date;
      // step 1: geta all services
      const services = await serviceCollection.find().toArray();
      // step 2 : get the booking of a perticuler day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      // step 3: for each service
      services.forEach((service) => {
        // step 4: match the service with booked - [{}, {}, {}, {}, {}, {}]
        const bookedServices = bookings.filter(
          (booked) => booked.treatment === service.name
        );
        // step 5: find add booked slots - ['', '', '',  '',  '', '']
        const bookedSlots = bookedServices.map((book) => book.slot);
        service.booked = bookedSlots; // creates a new array of slots
        // step 6: filter available slots - ['', '', '',  '', '']
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        // service.available = available; // creates a new array into service as availabe
        service.slots = available; // replace the previous slots just with avaialable slots
      });
      res.send(services);
      console.log("availabe route");
    });

    // get person based appointments
    app.get("/appointments", async(req, res) => {
      const email = req.query.email;
      const query = {email:  email}
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

// Home  route
app.get("/", (req, res) => {
  console.log("Home route");
  res.send("Server is running fine  ");
});
// listen to port
app.listen(port, () => {
  console.log(`Port running at http://localhost:${port}`);
});
