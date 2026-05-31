const { gql } = require('apollo-server');

const typeDefs = gql`
  type User {
    id: ID!
    username: String!
    email: String!
    city: String!
    createdAt: String!
    onlineStatus: OnlineStatus
    weather: Weather
  }

  type OnlineStatus {
    userId: ID!
    isOnline: Boolean!
    lastSeen: String
  }

  type Weather {
    city: String!
    temperature: Int!
    feelsLike: Int!
    humidity: Int!
    pressure: Int!
    windSpeed: Float!
    windDirection: Int!
    condition: String!
    description: String!
    icon: String!
    visibility: Int
    cloudCoverage: Int
    sunrise: String
    sunset: String
    timestamp: String!
  }

  type CacheStats {
    hits: Int!
    misses: Int!
    sets: Int!
    deletes: Int!
    hitRate: String!
    size: Int!
  }

  type SourceStatus {
    mysql: String!
    redis: String!
    weather: String!
  }

  type Query {
    user(id: ID!): User
    users(limit: Int, offset: Int): [User!]!
    weather(city: String!): Weather
    onlineStatus(userId: ID!): OnlineStatus
    onlineUsersCount: Int!
    cacheStats: CacheStats!
    sourceStatus: SourceStatus!
  }

  type Mutation {
    setOnlineStatus(userId: ID!, isOnline: Boolean!): OnlineStatus
    clearCache: Boolean!
  }
`;

module.exports = typeDefs;
