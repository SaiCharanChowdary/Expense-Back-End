const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path')

const app = express();

// connect to db
mongoose
    .connect(process.env.DATABASE, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 30000,
    })
    .then(() => console.log('DB connected'))
    .catch(err => console.log('DB CONNECTION ERROR: ', err));


// import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const transactionsRoute = require('./routes/transactionsRoute')


// app middleware
app.use(morgan('dev'));
app.use(bodyParser.json());

// app.use(cors()); // allows all origins
if ((process.env.NODE_ENV = 'development')) {
    app.use(cors({ origin: `http://localhost:3000` }));
}

// middleware
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api/transactions/', transactionsRoute)

const port = process.env.PORT || 5000;

if(process.env.NODE_ENV === 'production')
{
     app.use('/' , express.static('client/build'))

     app.get('*' , (req, res)=>{
         res.sendFile(path.resolve(__dirname, 'client/build/index.html'))
     })
}
app.listen(port, () => {
    console.log(`API is running on port ${port}`);
});