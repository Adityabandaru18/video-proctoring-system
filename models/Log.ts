import mongoose, { Schema, Document } from "mongoose";

interface Alert {
  message: string;
  timestamp: string;
}

export interface LogDocument extends Document {
  candidateName: string;
  startTime: Date;
  endTime: Date;
  focusLostCount: number;
  multipleFacesCount: number;
  objectAlertTypes: string[];
  alerts: Alert[];
  integrityScore: number;
}

const AlertSchema = new Schema({
  message: { type: String, required: true },
  timestamp: { type: String, required: true },
});

const LogSchema = new Schema<LogDocument>({
  candidateName: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  focusLostCount: { type: Number, required: true },
  multipleFacesCount: { type: Number, required: true },
  objectAlertTypes: { type: [String], required: true },
  alerts: { type: [AlertSchema], required: true },
  integrityScore: { type: Number, required: true },
});

export default mongoose.models.Log || mongoose.model<LogDocument>("Log", LogSchema);
