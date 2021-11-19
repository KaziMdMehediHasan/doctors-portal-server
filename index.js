const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient } = require("mongodb");
const admin = require("firebase-admin");
require("dotenv").config();
const ObjectId = require("mongodb").ObjectId;
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const fileUpload = require("express-fileUpload");



const port = process.env.PORT || 5000;
// doctors-portal-firebase-adminsdk.json;


// JWT token config middleware
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//middleware 
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tzgvu.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});


async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];
try{
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
      console.log(req.decodedEmail);
}
catch{
}

     
  }
  next()
}

async function run() {
  try {
    await client.connect();
    console.log('Database connection established');
    
    const database = client.db('doctors');
    const appointmentsCollection = database.collection('appointments');
    const usersCollection = database.collection('users');
    const doctorsCollection = database.collection('doctors');


    // get all data

    // app.get("/appointments", async (req, res) => {
    //   const cursor = appointmentsCollection.find({});
    //   const appointments = await cursor.toArray();
    //   res.json(appointments);
    // });

    // query by email & date
    app.get("/appointments", verifyToken, async (req, res)=>{
      const email = req.query.email;
      const date = new Date(req.query.date).toLocaleDateString();
      // console.log(date);
      const query = {email : email, date : date};
      // console.log(email);
      const cursor = appointmentsCollection.find(query);
      const appointments = await cursor.toArray();
      res.json(appointments);
    });

    app.get("/appointments/:id", async (req, res)=>{
      const id = req.params.id;
      const query ={_id:ObjectId(id)}
      const result = await appointmentsCollection.findOne(query);
      res.json(result);
    })

    app.get('/users/:email', async (req, res)=>{
      const email = req.params.email;
      const query = {email : email};
      const user = await usersCollection.findOne(query);

      let isAdmin = false
      if(user?.role === "admin"){
        isAdmin = true;
      }
      res.json({admin : isAdmin});
    })

    app.get('/doctors', async (req, res)=>{
      const cursor = doctorsCollection.find({});
      const doctors = await cursor.toArray();
      res.json(doctors);
    })
    //post API

    app.post('/appointments', async (req, res) => {
      const appointment = req.body;
      const result = await appointmentsCollection.insertOne(appointment);
      res.json(result);
    })

    app.post('/users', async (req, res) => {
      const users = req.body;
      const result = await usersCollection.insertOne(users);
      console.log(result);
      res.json(result);
    })



    //doctors API

    app.post('/doctors', async (req, res) => {
      // console.log('body', req.body);
      // console.log('files', req.files);
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.image;
      const picData = pic.data;
      const encodedPic = picData.toString('base64');
      const imageBuffer = Buffer.from(encodedPic, 'base64');
      const doctor ={
        name,
        email,
        imageBuffer,
      }
      const result = await doctorsCollection.insertOne(doctor);
      res.json(result);
      // res.json({success: true});
    })


    //update API

    app.put("/users", async (req, res) => {
      const user = req.body;

      const filter = {email: user.email};
      const options = {upsert : true};
      const updateDoc = {$set: user};
      const result  = await usersCollection.updateOne(filter, updateDoc, options);
      res.json(result);
    })

    app.put('/users/admin', verifyToken, async(req,res) => {
      const user = req.body;
      // console.log("decoded email", req.decodedEmail);
     const requester = req.decodedEmail;
     if(requester){
       const requesterAccount = await usersCollection.findOne({email:requester});
       if(requesterAccount.role === 'admin'){
      const filter = { email: user.email };
      // console.log(user.email);
      const updateDoc = { $set: { role: "admin" } };
      const result = await usersCollection.updateOne(filter, updateDoc);
      // console.log(result);
        res.json(result);
       }
     }

      else{
        res.status(403).json({message: 'You do not have access to make an Admin'})
      }
    
    })

    app.put("/users/normal",verifyToken, async (req, res) => {
      const user = req.body;
      // console.log("decoded email : ", req.decodedEmail);
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "user" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          console.log(result);
          res.json(result);
        }
      } else {
        res
          .status(403)
          .json({ message: "You do not have access to make an Admin" });
      }
    })

    // payment API

    app.post ('/create-payment-intent', async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price*100 //unit is always in cents , so we have to  multiply payment info with 100 to convert to $
      const paymentIntent = await stripe.paymentIntents.create({
        currency: 'usd',
        amount : amount,
        payment_method_types: ['card']
      });
      res.json({clientSecret: paymentIntent.client_secret})
    })


    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = {_id: ObjectId(id)};
      const updateDoc = {
        $set:{
          payment : payment
        }
      };
      const result = await appointmentsCollection.updateOne(filter, updateDoc);
      res.json(result);
    })
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});




/*api naming conention

    app.get('/users')
    app.post('/users')
    app.get('/users/:id')
    app.put('/users/:id')
    app.delete('/users/:id')
    users : post 
    users : get

    */