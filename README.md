# Video Proctoring System with Real-Time Detection and Reporting

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Architecture](#architecture)
- [Technologies Used](#technologies-used)
- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Report Generation Notes](#report-generation-notes)
- [Limitations](#limitations)
- [Future Enhancements](#future-enhancements)

---

## Introduction  

This project is a **web-based video proctoring system** developed with **Next.js**. It integrates:  

- **TensorFlow.js COCO-SSD** for object detection  
- **face-api.js** for facial recognition  

The system continuously tracks and flags suspicious activities such as:  
- Multiple faces appearing in the frame  
- Candidate absence  
- Detection of restricted objects  

It automatically generates **detailed PDF reports** containing alerts and an integrity score, while storing essential data in **MongoDB**.  

 **Live Demo**: [Video Proctoring System](https://v0-video-proctoring-ui-dun.vercel.app/)  

> ⚠️ **Note:** The video proctoring module may take a short time to initialize. Please wait for setup to complete before testing.  


## Features

- Real-time webcam video monitoring for face and objectdetection  
- Alerts for suspicious activities:
  - Absence of candidate
  - Multiple faces
  - Unauthorized devices or notes
- Calculation of integrity score based on detections  
- Multi-page PDF report generation with detailed logs  
- Persistent storage of reports and alerts in MongoDB  
- Next.js API integration for client-server communication  
- Responsive UI with loading spinners

---

## Architecture

<img width="905" height="616" alt="image" src="https://github.com/user-attachments/assets/55030a06-4385-42f5-bbdf-eb24dea9f0f1" />

---

## Technologies Used

- Next.js (Frontend & Backend)  
- face-api.js (facial detection)  
- TensorFlow.js COCO-SSD (object detection)  
- jsPDF (PDF generation)  
- MongoDB with Mongoose  
- Tailwind CSS (styling)  

---

## Installation

### Prerequisites

- Node.js v16 or higher  
- MongoDB instance (local or cloud)  
- npm package manager  

### Steps

1. Clone the repository:

```bash
git clone https://github.com/Adityabandaru18/video-proctoring-system.git
cd video-proctoring-system
````

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables in `.env`:

```env
NEXT_PUBLIC_MONGODB_URI="your_mongodb_connection_string"
```
---

## Usage

1. Run the development server:

```bash
npm run dev
```

2. Open [http://localhost:3000](http://localhost:3000) in a supported browser.
3. Enter the candidate’s name and start the session.
4. The system will monitor for suspicious activities and logs them along with the timestamps.
5. Stop the session to download the PDF report and the details are stored to the Database.
6. Find the session details at [http://localhost:3000/api/logs](http://localhost:3000/api/logs)

---

## API Endpoints

* `POST /api/logs` — Store proctoring session data in MongoDB
* `GET /api/logs` — Retrieve stored session reports, sorted by highest integrityScore first
<img width="1384" height="455" alt="image" src="https://github.com/user-attachments/assets/0751181e-ef2e-4e12-83bb-2840a44c7522" />

---

## Report Generation Notes

* Multi-page support is handled by tracking vertical space and adding new pages on overflow.
* Full logs of suspicious events and alerts are included.
* Integrity score and feedback text (e.g., "Excellent integrity maintained") are displayed.

### Example Report:
<img width="505" height="464" alt="image" src="https://github.com/user-attachments/assets/34b202b8-6d2d-4ff4-bdb8-b6b9024e301c" />

---

## Limitations

* User authentication and authorization are currently not implemented.
* Session video recording and playback features are not yet available.
* Real-time detection performance may be limited by browser capabilities.
* Current AI models can only detect a limited set of objects: cells, books, and small electronic devices.
* Audio detection/processing is currently unreliable and not fully functional.

---

## Future Enhancements

* Improve audio anomaly detection with ML models.
* Implement authentication and authorization.
* Add session video recording and playback.
* Build analytics dashboards for proctoring summaries.

---

