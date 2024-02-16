import aws from 'aws-sdk';

const { DynamoDB } = aws;
const documentClient = new DynamoDB.DocumentClient();

export async function handler(event) {
  if (!event.detail || typeof event.detail.user_id === 'undefined' || typeof event.detail.distance_in_meters === 'undefined') {
    console.error('Invalid event structure:', event);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid event structure. Must include event.detail with user_id and distance_in_meters." }),
    };
  }

  const { user_id: userId, distance_in_meters: distance, timestamp_local: workoutTime, activity_type: type } = event.detail;
  const tableName = "challenges";

  // only query challenges that cover the workout time
  let filterExpression = "#status = :currentStatus  AND #user_id = :userIdValue";
  filterExpression += " AND #start_date <= :workoutTime AND #end_date >= :workoutTime";

  // Query parameters to find active challenges for the user
  const queryParams = {
    TableName: tableName,
    ExpressionAttributeNames: {
      "#user_id": "user_id",
      "#status": "status",
      "#start_date": "start_date",
      "#end_date": "end_date"
    },
    ExpressionAttributeValues: {
      ":currentStatus": "current",
      ":userIdValue": userId,
      ":workoutTime": workoutTime 
    },
  };

  try {
    // Query Execution and Processing Results
    const queryResult = await documentClient.query(queryParams).promise();
    const challenges = queryResult.Items;
    
    // Check for No Results
    if (challenges.length === 0) {
      console.log(`No current challenges found for user ${userId}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "No current challenges found for the user." }),
      };
    }

    // Update Challenges
    for (const challenge of challenges) {
      const newMCompleted = challenge.completed_meters + distance;
      const isChallengeCompleted = newMCompleted >= challenge.target_meters;
      const newStatus = isChallengeCompleted ? "completed" : "current";
    
      // Simplified Update Expression
      let updateExpression = "SET completed_meters = completed_meters + :distance, #status = :newStatus";
    
      const expressionAttributeValues = {
        ":distance": distance,
        ":newStatus": newStatus,
      };
    
      // Now, we always use the #status, so we can define this outside of any condition
      const expressionAttributeNames = {
        "#status": "status", // Necessary for reserved words
      };
    
      const updateParams = {
        TableName: tableName,
        Key: { "user_id": userId, "challenge_id": challenge.challenge_id },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      };
    
      await documentClient.update(updateParams).promise();
    }
    
    
    console.log(`Successfully updated challenges for user ${userId}`);

    // Success response
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Challenges updated successfully." }),
    };
  } catch (error) {
    console.error("Error updating challenges for user:", userId, error);
    // Error response
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to update challenges due to an internal error." }),
    };
  }
}
