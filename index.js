const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');
require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);



var jwt = require('jsonwebtoken');
const res = require("express/lib/response");
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;

// mongodb config
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zwtgz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// jwt middleware 
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ Warning: 'UnAuthorized Request!!' })
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden Access!!' })
    }
    // console.log(decoded) // bar
    req.decoded = decoded;
    next();
  });
}


// email sending codes 
const auth = {
  auth: {
    api_key: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN
  }
}
const nodemailerMailgun = nodemailer.createTransport(mg(auth));
const sendBookingEmail = booking => {
  const { treatment, email, date, slot, patientName } = booking;

  const emailBody = {
    from: process.env.EMAIL_SENDER,
    to: email,
    subject: `Your appointment for ${treatment} on ${date} at ${slot} is confirmed.`,
    text: `Your appointment for ${treatment} on ${date} at ${slot} is confirmed.`,
    html: `
      <div>
      <h2>Hello ${patientName}, </h2>
      <p>Your appointment for ${treatment} on ${date} at ${slot} is confirmed.</p>
      <p>We are looking to see you on ${date} at ${slot}.</p>
      <br />
      <h3>Our Address</h3>
      <p>Head Office: Dhaka, Bangladesh</p>
      <p>Phone: 01612178331</p>
      <p>Web: https://web.programming-hero.com</p>
      </div>
    `
  }

  nodemailerMailgun.sendMail(emailBody, (err, info) => {
    if (err) {
      console.log(`Error`, err);
    }
    else {
      console.log('response', info);
    }
  });
}




// main routes ///////
async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("portal").collection("services");
    const bookingCollection = client.db("portal").collection("bookings");
    const usersCollection = client.db("portal").collection("users");
    const doctorCollection = client.db("portal").collection("doctors");



    const verifyAdmin = async (req, res, next) => {
      const requesterEmail = req.decoded.email;
      const requester = await usersCollection.findOne({ email: requesterEmail });
      if (requester.role !== 'admin') {
        return res.status(403).send({ messge: 'forbidden' })
      } else {
        next();
      }
    }
    //   find all services from db
    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
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
        // console.log('sending email');
        sendBookingEmail(booking);
        const result = await bookingCollection.insertOne(booking);
        res.send({ success: true, result: result });
        // console.log(result);
      }
    });



    // payment with stripe 
    app.post('/create-payment-intent', async(req, res) =>{
      const {price} = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price*100,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({clientSecret: paymentIntent.client_secret})
    })




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
    });

    // get person based appointments
    app.get("/appointments", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (decodedEmail === email) {
        const query = { email: email };
        const result = await bookingCollection.find(query).toArray();
        return res.send(result.reverse());
      } else {
        return res.status(403).send({ message: 'Forbidden Access!!' })
      }
    });

    // find single booking info for payment
    app.get('/booking/:id', verifyJWT, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: ObjectId(id)}
      const result = await bookingCollection.findOne(filter);
      res.send(result);
    })

    // make appointment paid 
    app.patch('/appointment/:id', async(req, res) => {
      const id = req.params.id;
      const filter = {_id: ObjectId(id)};
      const transactionId = req.body.transactionId;
      console.log(req.body, transactionId);
      const update = {$set: {paid: true, transactionId: transactionId}};
      const result = await bookingCollection.updateOne(filter, update);
      res.send(result);
    })

    // delte appointments 
    app.delete('/appointment/delete/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    })

    // create or edit user on database 
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const options = { upsert: true };
      const filter = { email: email };
      const update = { $set: user }
      const result = await usersCollection.updateOne(filter, update, options);
      const token = jwt.sign({ email: email }, process.env.JWT_SECRET, { expiresIn: '1d' })
      // console.log(token);
      res.send({ result, token });
    })

    // load all users 
    app.get('/users', verifyJWT, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
    })
    // delete user
    app.delete('/user/delete/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }
      const requesterEmail = req.decoded.email;
      const requester = await usersCollection.findOne({ email: requesterEmail });
      if (requester.role !== 'admin' || requesterEmail === email) {
        return res.status(403).send({ message: 'notAllowed' })
      } else {
        const result = await usersCollection.deleteOne(filter);
        res.send(result)
      }
    })

      // find user profile 
    app.get('/user/:email', async(req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({email: email});
      res.send(user);
    })

    // check an existing user if he is admin 
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      // console.log(user);
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin })
    })

    // make user admin 
    app.put('/user/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      // disallow normal user to make another admin 
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        const filter = { email: email }
        const update = { $set: { role: 'admin' } }
        const result = await usersCollection.updateOne(filter, update);
        res.send(result);
      } else {
        res.status(403).send({ message: 'notAllowed' })
      }
    })

    // remove as admin
    app.put('/user/remove/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requesterEmail = req.decoded.email;
      const requester = await usersCollection.findOne({ email: requesterEmail });
      if (email === requesterEmail || requester.role !== 'admin') {
        res.status(403).send({ message: "You can't remove yourself", reason: 'self' });
      } else {
        const filter = { email: email };
        const update = { $unset: { role: 1 } };
        const result = await usersCollection.updateOne(filter, update);
        res.send(result);
      }
    })

    // add doctor 
    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const filterEmail = doctor.email;
      const exist = await doctorCollection.findOne({ email: filterEmail });
      if (exist) {
        return res.send({ message: 'Already exist' })
      } else {
        const result = await doctorCollection.insertOne(doctor);
        res.send(result);
      }
    })
    // find all doctors 
    app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await doctorCollection.find().toArray();
      res.send(result);
    })

    // delete doctor 
    app.delete('/doctor/:id', async (req, res) => {
      const id = req.params.id;
      const result = await doctorCollection.deleteOne({ _id: ObjectId(id) });
      res.send(result)
    })



  } finally {
  }
}
run().catch(console.dir);

// Home  route
app.get("/", (req, res) => {
  res.send("Doctors portal is running fine");
});

// listen to port
app.listen(port, () => {
  console.log(`Port running at http://localhost:${port}`);
});
