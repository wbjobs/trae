const mongoose = require('mongoose');

const annotationSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['arrow', 'rectangle', 'text']
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Number,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  color: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

annotationSchema.index({ roomId: 1, timestamp: 1 });

module.exports = mongoose.model('Annotation', annotationSchema);
