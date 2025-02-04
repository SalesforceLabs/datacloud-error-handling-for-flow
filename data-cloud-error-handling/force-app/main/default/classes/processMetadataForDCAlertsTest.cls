/**
 * 
 */
@isTest
private class processMetadataForDCAlertsTest {

    @isTest
    static void testNoMetadataToDeploy() {
        String formInputs = '{"typesToDeploy": ""}';

        test.startTest();
        try {
            processMetadataForDCAlerts.newSetup(formInputs);
        } catch (Exception e) {
            System.assertEquals('No alerts to deploy for the selected Data Cloud metadata types.', e.getMessage(), 'Deployment was not scheduled as expected');
        }
        test.stopTest();
    }

    @isTest
    static void testAllTypes() {
        String formInputs = '{"typesToDeploy": "DataStream"}';
        DataStream ds = new DataStream();
        ds.Name = 'Test';
        ds.RefreshMode = 'FULL_REFRESH';
        ds.RefreshFrequency = 'NONE';
        ds.IsRefreshDeliveryHourAutomatic = true;
        ds.Description = 'test';
        ds.RefreshHours = '1';
        ds.RefreshDayOfMonth = 1;
        ds.RefreshDayOfWeek = 1;
        //ds.DataStreamStatus = 'INACTIVE';
        //ds.IsNewFieldsAvailable = true;
        //ds.StreamType = 'INGEST';
        //ds.ImportRunStatus = 'SUCCESS';
        //insert ds;

        test.startTest();
        try {
            processMetadataForDCAlerts.newSetup(formInputs);
        } catch (Exception e) {
            System.assertEquals('No alerts to deploy for the selected Data Cloud metadata types.', e.getMessage(), 'Deployment was not scheduled as expected');
        }
        test.stopTest();
    }
}