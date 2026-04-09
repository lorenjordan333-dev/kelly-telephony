const express = require("express");
const http = require("http");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const MONITOR_NUMBER = "+14388071579"; // Noam's number
const TWILIO_NUMBER = process.env.TWILIO_NUMBER;
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.get("/", (req, res) => {
  res.send("voice-telephony alive");
});

app.get("/voice", (req, res) => {
  res.send("voice route alive");
});

// Main endpoint - customer calls in
app.post("/voice", (req, res) => {
  console.log("VOICE HIT");
  const streamUrl = process.env.STREAM_WS_URL;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const callerNumber = req.body.From;

  console.log("Incoming call from:", callerNumber);

  // Connect customer to Kelly stream
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;

  res.set("Content-Type", "text/xml");
  res.status(200).send(twiml);

  // After 3 seconds, call Noam silently to monitor
  setTimeout(async () => {
    try {
      await twilioClient.calls.create({
        to: MONITOR_NUMBER,
        from: TWILIO_NUMBER,
        url: `https://${host}/monitor-join`,
      });
      console.log("Monitor call initiated to:", MONITOR_NUMBER);
    } catch (err) {
      console.error("Failed to dial monitor:", err.message);
    }
  }, 3000);
});

// What Noam hears when he picks up
app.post("/monitor-join", (req, res) => {
  console.log("Monitor joined");
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Monitoring active. Press star 1 to take over.</Say>
  <Gather numDigits="2" action="/monitor-action" timeout="3600">
    <Pause length="3600"/>
  </Gather>
</Response>`;
  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

// Noam presses *1 to take over
app.post("/monitor-action", (req, res) => {
  const digits = req.body.Digits;
  console.log("Monitor pressed:", digits);

  if (digits === "*1") {
    console.log("TAKEOVER initiated");
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Taking over now.</Say>
  <Dial>${req.body.From}</Dial>
</Response>`;
    res.set("Content-Type", "text/xml");
    res.send(twiml);
  } else {
    // Keep listening
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="2" action="/monitor-action" timeout="3600">
    <Pause length="3600"/>
  </Gather>
</Response>`;
    res.set("Content-Type", "text/xml");
    res.send(twiml);
  }
});

const PORT = process.env.PORT || 3000;
http.createServer(app).listen(PORT, () => {
  console.log("voice-telephony running on port " + PORT);
});
