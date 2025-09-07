const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Question Schema
const questionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  step_no: {
    type: Number,
    required: true
  },
  sub_step_no: {
    type: Number,
    required: true
  },
  sl_no: {
    type: Number,
    required: true
  },
  step_title: {
    type: String,
    required: true
  },
  sub_step_title: {
    type: String,
    required: true
  },
  question_title: {
    type: String,
    required: true
  },
  post_link: {
    type: String,
    required: true
  },
  review: {
    type: Boolean,
    default: false
  },
  completed: {
    type: Boolean,
    default: false
  },
  yt_link: {
    type: String,
    default: null
  },
  plus_link: {
    type: String,
    default: null
  },
  editorial_link: {
    type: String,
    default: null
  },
  lc_link: {
    type: String,
    default: null
  },
  company_tags: {
    type: [String],
    default: null
  },
  difficulty: {
    type: Number,
    required: true,
    min: 0,
    max: 2 // 0: Easy, 1: Medium, 2: Hard
  },
  ques_topic: {
    type: [Object],
    required: true
  }
}, {
  timestamps: true
});

const Question = mongoose.model('Question', questionSchema, 'questions');

// API Routes

// GET: Get all questions with pagination and search
app.get('/api/questions', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      step_no,
      difficulty,
      completed,
      review,
      sort = 'sl_no'
    } = req.query;

    // Build filter object
    const filter = {};
    
    // Search in question title, step title, or sub step title
    if (search) {
      filter.$or = [
        { question_title: { $regex: search, $options: 'i' } },
        { step_title: { $regex: search, $options: 'i' } },
        { sub_step_title: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Additional filters
    if (step_no) filter.step_no = parseInt(step_no);
    if (difficulty !== undefined) filter.difficulty = parseInt(difficulty);
    if (completed !== undefined) filter.completed = completed === 'true';
    if (review !== undefined) filter.review = review === 'true';

    // Build sort object
    const sortOptions = {};
    const sortFields = sort.split(',');
    sortFields.forEach(field => {
      if (field.startsWith('-')) {
        sortOptions[field.substring(1)] = -1;
      } else {
        sortOptions[field] = 1;
      }
    });

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const totalQuestions = await Question.countDocuments(filter);
    
    // Get questions with pagination
    const questions = await Question.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    // Calculate pagination info
    const totalPages = Math.ceil(totalQuestions / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.json({
      success: true,
      data: {
        questions,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalQuestions,
          questionsPerPage: limitNum,
          hasNextPage,
          hasPrevPage
        }
      }
    });

  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching questions',
      error: error.message
    });
  }
});

// GET: Get single question by ID
app.get('/api/questions/:id', async (req, res) => {
  try {
    const question = await Question.findOne({ id: req.params.id });
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    res.json({
      success: true,
      data: question
    });

  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching question',
      error: error.message
    });
  }
});

// PUT: Toggle question completion status
app.put('/api/questions/:id/completed', async (req, res) => {
  try {
    const question = await Question.findOne({ id: req.params.id });
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Toggle completed status
    question.completed = !question.completed;
    await question.save();

    res.json({
      success: true,
      message: `Question marked as ${question.completed ? 'completed' : 'not completed'}`,
      data: {
        id: question.id,
        completed: question.completed
      }
    });

  } catch (error) {
    console.error('Error updating question completion:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating question completion',
      error: error.message
    });
  }
});

// PUT: Toggle question review status
app.put('/api/questions/:id/review', async (req, res) => {
  try {
    const question = await Question.findOne({ id: req.params.id });
    
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Toggle review status
    question.review = !question.review;
    await question.save();

    res.json({
      success: true,
      message: `Question ${question.review ? 'marked for review' : 'removed from review'}`,
      data: {
        id: question.id,
        review: question.review
      }
    });

  } catch (error) {
    console.error('Error updating question review status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating question review status',
      error: error.message
    });
  }
});

// GET: Get question statistics
app.get('/api/questions/stats/overview', async (req, res) => {
  try {
    const totalQuestions = await Question.countDocuments();
    const completedQuestions = await Question.countDocuments({ completed: true });
    const reviewQuestions = await Question.countDocuments({ review: true });
    
    // Get difficulty breakdown
    const difficultyStats = await Question.aggregate([
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get step-wise breakdown
    const stepStats = await Question.aggregate([
      {
        $group: {
          _id: '$step_no',
          count: { $sum: 1 },
          completed: { $sum: { $cond: ['$completed', 1, 0] } },
          review: { $sum: { $cond: ['$review', 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          total: totalQuestions,
          completed: completedQuestions,
          review: reviewQuestions,
          remaining: totalQuestions - completedQuestions,
          completionPercentage: Math.round((completedQuestions / totalQuestions) * 100)
        },
        difficultyBreakdown: difficultyStats.map(item => ({
          difficulty: item._id === 0 ? 'Easy' : item._id === 1 ? 'Medium' : 'Hard',
          count: item.count
        })),
        stepBreakdown: stepStats
      }
    });

  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;