import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT;
const MONGO_URL = process.env.MONGO_URL;

//** Create Connection **//
const createConnection = async () => {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  console.log("connected to db");
  return client;
};

const client = await createConnection();

//** Basic Func  */
//** Get Booking data from DB */
const getCustomerData = async () =>
  await client.db("bookingApp").collection("bookings").find({}).toArray();

//** Get Room data from DB */
const getRoomData = async () =>
  await client.db("bookingApp").collection("room").find({}).toArray();

//** Convert Timestamp value into Time  */
const getTime = (timeStamp) => {
  let date = new Date(timeStamp);
  return date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
};

//** Convert Timestamp value into Date*/
const getDate = (timeStamp) => {
  let date = new Date(timeStamp);
  return date.getDate() + "/" + date.getMonth() + "/" + date.getFullYear();
};

// Api to get the app name
app.get("/", (req, res) => {
  res.send("Booking App");
});

// Api to create a room
app.post("/create-room", async (req, res) => {
  const data = req.body;
  const response = await client
    .db("bookingApp")
    .collection("room")
    .insertOne(data);
  res.send(data);
});

// Api to create a bulk room
app.post("/bulk-create-room", async (req, res) => {
  const data = req.body;
  const response = await client
    .db("bookingApp")
    .collection("room")
    .insertMany(data);
  res.send(response);
});

// Api to get rooms data
app.get("/rooms", async (req, res) => {
  let data = await client
    .db("bookingApp")
    .collection("room")
    .find({})
    .toArray();
  res.send(data);
});

// Api to get room data using id
app.get("/rooms/:id", async (req, res) => {
  let { id } = req.params;
  let data = await client
    .db("bookingApp")
    .collection("room")
    .find({ id: id })
    .toArray();
  console.log(data);
  res.send(data);
});

// To check room's availability
const checkRoomAvailable = async (bookingData) => {
  let getRoom = await client
    .db("bookingApp")
    .collection("room")
    .findOne({ id: bookingData["Room Id"] });

  if (!getRoom) {
    return "No room present";
  }

  console.log("getRoom", getRoom);

  let getBookingTime = await client
    .db("bookingApp")
    .collection("bookings")
    .find({
      "Room Id": bookingData["Room Id"],
      $or: [
        {
          $and: [
            //6 < 6.30
            //Start time < booking start time
            { "Start Time": { $lte: bookingData["Start Time"] } },
            //8 > 7.30
            //End time > booking end time
            { "End Time": { $gte: bookingData["End Time"] } },
          ],
        },
        {
          $and: [
            //Start time > booking start time
            { "Start Time": { $gte: bookingData["Start Time"] } },
            //end time < booking end time
            { "End Time": { $lte: bookingData["End Time"] } },
          ],
        },
        {
          $and: [
            //Start time < booking start time
            { "Start Time": { $lte: bookingData["Start Time"] } },
            //end time > booking start time
            { "End Time": { $gte: bookingData["Start Time"] } },
          ],
        },
        {
          $and: [
            //Start time < booking end time
            { "Start Time": { $lte: bookingData["End Time"] } },
            //end time > booking end time
            { "End Time": { $gte: bookingData["End Time"] } },
          ],
        },
      ],
    })
    .toArray();

  console.log("getBookingTime", getBookingTime);

  if (getBookingTime.length === 0) {
    return "No room Booked";
  } else {
    return { "Booked Rooms": getBookingTime };
  }
};

// Api to Book a room
app.post("/book", async (req, res) => {
  let data = req.body;

  //date and time coversions
  let bookingDate = data["Booking Date"];
  data["Start Time"] = Date.parse(`${bookingDate} ${data["Start Time"]}`);
  data["End Time"] = Date.parse(`${bookingDate}  ${data["End Time"]}`);
  data["Booking Date"] = Date.parse(`${bookingDate}`);

  //Checking date time overlapping
  let response = "";
  if (data["Start Time"] > data["End Time"]) {
    response = "Start time overlaps End time";
  } else {
    let check = await checkRoomAvailable(data);
    if (check === "No room Booked") {
      response = await client
        .db("bookingApp")
        .collection("bookings")
        .insertOne(data);
    } else {
      response = check;
    }
  }
  res.send(response);
});

// Api to get booked rooms data
app.get("/booked-rooms", async (req, res) => {
  let customers = await getCustomerData();

  let rooms = await getRoomData();

  let uniqueRooms = rooms
    .map((room) => room["Room Name"])
    .filter((room, ind, arr) => arr.indexOf(room) === ind);

  let roomNames = {};
  rooms.map((room) => {
    roomNames[room["Room Name"]] = room.id;
    return true;
  });

  let response = uniqueRooms.map((room) => {
    return {
      "Room Name": room,
      "Boooked Details": customers
        .filter((cust) => cust["Room Id"] === roomNames[room])
        .map((cust) => {
          return {
            "Booked Status": "Booked",
            "Customer Name": cust["Customer Name"],
            Date: getDate(cust["Booking Date"]),
            "Start Time": getTime(cust["Start Time"]),
            "End Time": getTime(cust["End Time"]),
          };
        }),
    };
  });

  res.send(response);
});

// Api to get customers dataa
app.get("/customers", async (req, res) => {
  let customers = await getCustomerData();

  let rooms = await getRoomData();

  let roomNames = rooms.map((room) => {
    return {
      id: room.id,
      "Room Name": room["Room Name"],
    };
  });

  let uniqueCustomers = customers
    .map((customer) => customer["Customer Name"])
    .filter((name, ind, arr) => arr.indexOf(name) === ind);

  let response = uniqueCustomers.map((customer) => {
    return {
      "Customer Name": customer,
      "Booking Details": customers
        .filter((cust) => cust["Customer Name"] === customer)
        .map((cust) => {
          return {
            "Booking Date": getDate(cust["Booking Date"]),
            "Start Time": getTime(cust["Start Time"]),
            "End Time": getTime(cust["End Time"]),
            "Room Name": roomNames.filter(
              (room) => room.id === cust["Room Id"]
            )[0]["Room Name"],
          };
        }),
    };
  });

  res.send(response);
});

app.listen(PORT, () => {
  console.log(`Connecting to port ${PORT}`);
});
