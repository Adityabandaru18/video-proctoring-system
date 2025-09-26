# Video Proctoring System with Real-Time Detection and Reporting

## Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Technologies Used](#technologies-used)
- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [PDF Generation Notes](#pdf-generation-notes)
- [Limitations](#limitations)
- [Future Enhancements](#future-enhancements)
- [Demo Video](#demo-video)

---

## Introduction

This project is a web-based video proctoring system built using Next.js and React. It leverages:

- **TensorFlow.js COCO-SSD** for object detection  
- **face-api.js** for facial recognition  

The system monitors suspicious activities such as multiple faces, absence of the candidate, presence of prohibited items, and unexpected voices. It generates detailed multi-page PDF reports with alerts and integrity scores and stores session data in MongoDB via API.

---

## Features

- Real-time webcam video monitoring for face, object, and audio detection  
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

## Architecture Overview

<img width="905" height="616" alt="image" src="https://github.com/user-attachments/assets/55030a06-4385-42f5-bbdf-eb24dea9f0f1" />

---

## Technologies Used

- Next.js (Frontend & Backend)  
- React.js  
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
git clone https://your-repo-url.git
cd your-repo-directory
````

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables in `.env`:

```env
MONGODB_URI="your_mongodb_connection_string"
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

---

## API Endpoints

* `POST /api/logs` — Store proctoring session data
* `GET /api/logs` — Retrieve stored session reports

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

## Demo Video

*A link to a demo video showcasing the system in action.*


