const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_TEST_KEY);
const bodyParser = require('body-parser');
const endpointSecret = process.env.WEBHOOK_END_POINT_S;

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// Enable CORS
app.use(cors());

app.use((req, res, next) => {
    if (req.originalUrl === '/webhooks') {
      next();
    } else {
      express.json()(req, res, next);
    }
  });

// Parse JSON request bodies
//app.use(express.json());

const User = require('./models/User'); // Import the User model

const tempUser = new User({
    username: 'johndoe',
    email: 'johndoe3@example.com',
    password: 'password123' // Note that this password is not hashed!
  });
  // Check if a user with the same email already exists
  User.findOne({ email: tempUser.email })
    .then((existingUser) => {
      if (existingUser) {
        // If a user with the same email exists, log an error
        console.error('Error creating temporary user: User with this email already exists');
      } else {
        // If no user with the same email exists, save the new user
        tempUser.save()
          .then(() => {
            console.log('Temporary user created:', tempUser);
          })
          .catch((error) => {
            console.error('Error creating temporary user:', error);
          });
      }
    })
    .catch((error) => {
      console.error('Error checking for existing user:', error);
    });
    const tempUser2 = new User({
    username: 'eyosias',
    email: 'eyosias17@gmail.com',
    password: 'password1234' // Note that this password is not hashed!
  });
  // Check if a user with the same email already exists
  User.findOne({ email: tempUser2.email })
    .then((existingUser) => {
      if (existingUser) {
        // If a user with the same email exists, log an error
        console.error('Error creating temporary user: User with this email already exists');
      } else {
        // If no user with the same email exists, save the new user
        tempUser2.save()
          .then(() => {
            console.log('Temporary user created:', tempUser2);
          })
          .catch((error) => {
            console.error('Error creating temporary user:', error);
          });
      }
    })
    .catch((error) => {
      console.error('Error checking for existing user:', error);
    });

// // Create a temporary user object
// const tempUser1 = new User({
//     username: 'johndoe',
//     email: 'johndoe3@example.com',
//     password: 'password123' // Note that this password is not hashed!
//   });
//   // Save the temporary user to the database
//   tempUser1.save()
//     .then(() => {
//       console.log('Temporary user created:', tempUser1);
//     })
//     .catch((error) => {
//       console.error('Error creating temporary user:', error);
//     });

// // Create a MongoClient with a MongoClientOptions object to set the Stable API version
app.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const user = await User.create({ username, email, password });
    const token = jwt.sign({ userId: User.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ message: 'User created successfully', user, token });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Define authentication route
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  // Check if user exists
  // Find user by email
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Check if password is correct
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return res.status(401).json({ message: 'Invalid password' });
  }

  // Create and sign JWT
  const token = jwt.sign({ userId: User.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // Return JWT
  res.json({ token });
});
app.post('/webhooks', express.raw({type: 'application/json'}),async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error(err);
      return res.status(400).send(`Webhook error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object; // The PaymentIntent object
        const customerId = paymentIntent.customer; // Retrieve the customer ID

        try {
            // Fetch the customer details from Stripe
            const customer = await stripe.customers.retrieve(customerId);
            const customerEmail = customer.email; // Customer email from Stripe

            // Update user's paymentComplete status in the database
            const updatedUser = await User.findOneAndUpdate(
                { email: customerEmail },
                { paymentComplete: true },
                { new: true }
            );

            if (updatedUser) {
                console.log(`Payment succeeded and status updated for user: ${updatedUser.email}`);
            } else {
                console.log('User not found with that email:', customerEmail);
            }
        } catch (error) {
            console.error('Error handling payment_intent.succeeded:', error);
            return res.status(500).send('Internal Server Error');
        }
    }


    // Return a 200 response to acknowledge receipt of the event
    res.send();
  });
// Define protected route
app.get('/users/dashboard', (req, res) => {
  // Check if JWT is present in 'Authorization' header
  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Verify JWT
  const token = authorizationHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Return protected resource
  res.json({ message: `Welcome to the dashboard, ${User.username}!` });
});



app.get('/users/:userEmail/payment', async (req, res) => {
    const { userEmail } = req.params;  // Extract email from URL parameters

    try {
        // Decode the email, assuming it's URI encoded
        const decodedEmail = userEmail;
        console.log(decodedEmail);

        // Find the user by their email
        const user = await User.findOne({ email: decodedEmail });
        console.log(user);
        if (user) {
            // Send the paymentComplete status if the user is found
            res.json({ paymentComplete: user.paymentComplete });
        } else {
            // Respond with an error message if no user is found
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        // Handle any other errors (e.g., database errors)
        console.error('Error retrieving user payment status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 5001;
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(()=> {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        });
}).catch((error) => console.log(`${error} did not connect`));


