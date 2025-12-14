export interface IWebhookDispatcher {
    dispatch(eventType: string, data: any): Promise<boolean>;
}
