export const config = {
  yjsPort: 1234,
  appPort: 1235,
  apiPort: 1236,
  yjsWsUrl: 'ws://localhost:1234',
  appWsUrl: 'ws://localhost:1235',
  apiUrl: 'http://localhost:1236',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  s3Bucket: process.env.S3_BUCKET || ''
};
