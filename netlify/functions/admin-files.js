exports.handler = async (event) => {
  return {
    statusCode: 501,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "PDF upload service is not configured yet."
    })
  };
};
