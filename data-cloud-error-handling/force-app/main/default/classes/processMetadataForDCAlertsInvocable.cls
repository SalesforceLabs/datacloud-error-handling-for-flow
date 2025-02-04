public with sharing class processMetadataForDCAlertsInvocable {
    
    private static final String CUSTOM_METADATA_TYPE_NAME = 'DataCloudAlertConfiguration__mdt';
    private static final String MASTER_LABEL = 'Data Cloud Alert Configuration';
    private static final String DEVELOPER_NAME = 'Data_Cloud_Alert_Configuration';
    
    private processMetadataForDCAlertsInvocable() {

    }

    public class FlowInput {
        @InvocableVariable(required=true label='Notification Type' description='Set this to \'Email\' to receive email notifications or \'Notification Bell\' to receive in-app notifications')
        public String notificationType;

        @InvocableVariable(required=true label='Notification Frequency' description='Receive notifications for every error, or only for the first error in a 24 hour period.')
        public String notificationFrequency;

        @InvocableVariable(label='Email Template Name' description='The name of the email template to use for email notifications. Required if Notification Type is set to \'Email\'')
        public String emailTemplateName;
    }

    @InvocableMethod(
        category='Custom Metadata'
        label='Create New Custom Data Cloud Alert Configuration'
        description='Provides the ability to create a new custom metadata record which controls the Data cloud alert functionality'
    )
    public static List<SObject> newInstance(List<FlowInput> inputs) {
        System.debug('CustomMetadataInputs: ' + inputs);

        List<String> customMetadataRecordNames = new List<String>();
        List<SObject> customMetadataRecords = new List<SObject>();

        for (FlowInput input : inputs) {
            SObjectType sobjectType = Schema.getGlobalDescribe().get(CUSTOM_METADATA_TYPE_NAME);
            SObject newCustomMetadataRecord = sobjectType.newSObject();

            newCustomMetadataRecord.put('MasterLabel', MASTER_LABEL);
            newCustomMetadataRecord.put('DeveloperName', DEVELOPER_NAME);

            String fullName = getFullName(newCustomMetadataRecord);
            customMetadataRecordNames.add(fullName);

            customMetadataRecords.add(newCustomMetadataRecord);
        }

        return customMetadataRecords;
    }

    private static String getFullName(SObject customMetadataRecord) {
        String customMetadataTypePrefix = customMetadataRecord.getSObjectType().getDescribe().getName().replace('__mdt', '');
        return customMetadataTypePrefix + '.' + customMetadataRecord.get('DeveloperName');
    }
}