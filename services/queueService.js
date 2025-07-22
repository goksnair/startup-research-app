const Queue = require('bull');
const redis = require('redis');

// Create Redis connection for queue
const redisConfig = {
    redis: {
        port: process.env.REDIS_PORT || 6379,
        host: process.env.REDIS_HOST || 'localhost',
        password: process.env.REDIS_PASSWORD || undefined
    }
};

// Create job queues
const analysisQueue = new Queue('startup analysis', redisConfig);
const batchQueue = new Queue('batch processing', redisConfig);
const emailQueue = new Queue('email notifications', redisConfig);
const reportQueue = new Queue('report generation', redisConfig);

// Queue monitoring and error handling
analysisQueue.on('completed', (job, result) => {
    console.log(`✅ Analysis job ${job.id} completed for company: ${job.data.company}`);
});

analysisQueue.on('failed', (job, err) => {
    console.log(`❌ Analysis job ${job.id} failed: ${err.message}`);
});

batchQueue.on('completed', (job, result) => {
    console.log(`✅ Batch job ${job.id} completed: ${result.companiesProcessed} companies`);
});

batchQueue.on('failed', (job, err) => {
    console.log(`❌ Batch job ${job.id} failed: ${err.message}`);
});

emailQueue.on('completed', (job, result) => {
    console.log(`✅ Email sent to ${job.data.email}`);
});

reportQueue.on('completed', (job, result) => {
    console.log(`✅ PDF report generated: ${result.fileName}`);
});

// Queue statistics
const getQueueStats = async () => {
    const [analysisWaiting, analysisActive, batchWaiting, batchActive] = await Promise.all([
        analysisQueue.waiting(),
        analysisQueue.active(),
        batchQueue.waiting(),
        batchQueue.active()
    ]);

    return {
        analysis: {
            waiting: analysisWaiting.length,
            active: analysisActive.length
        },
        batch: {
            waiting: batchWaiting.length,
            active: batchActive.length
        }
    };
};

// Clean completed jobs periodically
const cleanupJobs = async () => {
    try {
        await analysisQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
        await batchQueue.clean(24 * 60 * 60 * 1000, 'completed');
        await emailQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed'); // 7 days
        await reportQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed');
        console.log('✅ Queue cleanup completed');
    } catch (error) {
        console.error('❌ Queue cleanup failed:', error);
    }
};

// Run cleanup every hour
setInterval(cleanupJobs, 60 * 60 * 1000);

module.exports = {
    analysisQueue,
    batchQueue,
    emailQueue,
    reportQueue,
    getQueueStats
};
