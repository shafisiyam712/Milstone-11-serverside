require('dotenv').config();
const express=require ('express')
const cors=require ('cors')
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app=express()
const port=process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

//middleware 
app.use(cors({
  origin: [
      'http://localhost:5173',
       'https://my-food-web.web.app',
       'https://my-food-web.firebaseapp.com'
  ],
  credentials: true
}));
app.use(express.json())
// cookie parser middleware
app.use(cookieParser());

// custom middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log('token inside the verifyToken', token);

  if (!token) {
      return res.status(401).send({ message: 'Unauthorized access' })
  }

  //verify the token
  //Make sure ACCESS_TOKEN_SECRET is also added to your .env file
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
          return res.status(401).send({ message: 'Token verification failed: ' + err.message })
      }
      // if there is no error,
      req.user = decoded;
      next();
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8q3cu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
console.log(uri);

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();
    // Send a ping to confirm a successful connection

    const FoodCollection = client.db('Fooddb').collection('FoodCollection');
    const RequestCollection = client.db('Fooddb').collection('Request');
    
    //await client.db("admin").command({ ping: 1 });
    //console.log("Pinged your deployment. You successfully connected to MongoDB!");
    
    // auth related APIs for jwt token
     app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });

      res
          .cookie('token', token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
          })
          .send({ success: true })

  });

  app.post('/logout', (req, res) => {
      res
          .clearCookie('token', {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
          })
          .send({ success: true })
  })



    //get all food item in db
    app.post('/foods',async(req,res)=>{
      const newFood=req.body
      console.log(newFood);
      const result=await FoodCollection.insertOne(newFood)
      res.send(result)
    })

    //get food in server port and implement search
  app.get('/foods', async (req, res) => {
    const { searchParams } = req.query;
    console.log("Search parameter received:", searchParams);

    let option = { status: "available" }; // Default filter to include only available items

    // Add search condition if `searchParams` is provided
    if (searchParams && searchParams.trim() !== "") {
        option.FoodName = { $regex: searchParams, $options: "i" };
    }

    try {
        const result = await FoodCollection.find(option).toArray();
        console.log("Filtered Results:", result);
        res.send(result);
    } catch (error) {
        console.error("Error fetching foods:", error);
        res.status(500).send({ error: "Failed to fetch foods" });
    }
});


   //new top rated route to show in home featured section
   app.get('/foods/top', async (req, res) => {
    let option = { status: "available" };
    try {
        const cursor = FoodCollection.find(option)
            .sort({ FoodQuantity: -1 }) 
            .limit(6); 
        const result = await cursor.toArray();
        res.send(result);
    } catch (error) {
        console.error('Error fetching foods:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});




// Request food Insert request and update food status
app.post("/foods/request",async (req, res) => {
  const {
    foodId,
    FoodName,
    FoodImage,
    PickUpLocation,
    ExpiredDate,
    Notes,
    donatorEmail,
    donatorName,
    requesterEmail,
  } = req.body;

  try {
    // Update food status to "not available"
    const foodUpdateResult = await FoodCollection.updateOne(
      { _id: new ObjectId(foodId) },
      { $set: { status: "not available" } }
    );

    if (foodUpdateResult.modifiedCount === 0) {
      return res
        .status(400)
        .send({ success: false, message: "Failed to update food status." });
    }

    // Insert the request into RequestCollection
    const requestResult = await RequestCollection.insertOne({
      foodId,
      FoodName,
      FoodImage,
      PickUpLocation,
      ExpiredDate,
      Notes,
      donatorEmail,
      donatorName,
      requesterEmail,
      requestDate: new Date(),
    });

    res.send({ success: true, requestId: requestResult.insertedId });
  } catch (error) {
    console.error("Error handling food request:", error);
    res.status(500).send({ success: false, message: "Server Error" });
  }
});

// Get requested foods for a specific user
app.get("/foods/request",verifyToken,async (req, res) => {
  const { userEmail } = req.query;

  if (!userEmail) {
    return res.status(400).send({ success: false, message: "User email is required." });
  }

  try {
    const userRequests = await RequestCollection.find({ requesterEmail: userEmail }).toArray();
    res.send(userRequests);
  } catch (error) {
    console.error("Error fetching user requests:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
});

//get specific user added food item from fooddb (VerifyToken)
app.get("/foods/user",verifyToken,async (req, res) => {
  const { userEmail } = req.query;

  if (!userEmail) {
    return res.status(400).send({ success: false, message: "User email is required." });
  }

  try {
    // Find all food entries associated with the given email
    const userFoods = await FoodCollection.find({ userEmail: userEmail}).toArray();
    res.send(userFoods);
  } catch (error) {
    console.error("Error fetching user foods:", error);
    res.status(500).send({ success: false, message: "Internal Server Error" });
  }
});



//update food 
//get id from db


app.get('/foods/user/:id',async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const food = await FoodCollection.findOne(filter);

  if (food) {
    res.status(200).send(food);
  } else {
    res.status(404).send({ message: 'Food not found' });
  }
});
app.put('/foods/user/:id', async (req, res) => { 
  try {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const options = { upsert: true };
    const updatedDoc = {
      $set: req.body
    };

    const result = await FoodCollection.updateOne(filter, updatedDoc, options);
    res.status(200).send(result); // Always return a proper response
  } catch (error) {
    console.error('Error updating food:', error);
    res.status(500).send({ message: 'Failed to update food' });
  }
});


  
  
  
  //go to specific food 
    app.get('/foods/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await FoodCollection.findOne(query);
      res.send(result);
  })
  
  
  
  //delete food
   app.delete('/foods/:id',async (req,res)=>{
    const id=req.params.id
    const query= {_id:new ObjectId(id)}
    const result=await FoodCollection.deleteOne(query)
    res.send(result);
  })

  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/',(req,res)=>{
    res.send('Food server is running')
  })
  
  
  app.listen(port,()=>{
      console.log(`Food server is running on port:${port}`);
      
  })