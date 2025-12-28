export class ComplaintPrompts {
  /**
   * Generates the prompt for identifying the core vehicle complaint.
   */
  static identification(message: string): string {
    return `The user has started a diagnostic session. Identify the core vehicle complaint from the following message, responding with ONLY the complaint text. If no clear complaint is present, respond with 'N/A'.
Message: '${message}'`;
  }
}
