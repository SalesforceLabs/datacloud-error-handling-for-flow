public with sharing class processMetadataForDCAlerts implements Metadata.DeployCallback {

    public static Boolean deployRequired = false;
    public static Metadata.DeployContainer mdContainer = new Metadata.DeployContainer();
    public static Map<String, String> typeMap = new Map<String, String>{'DataStream' => 'Data Stream', 'MktDataTransform' => 'Data Transform', 'IdentityResolution' => 'Identity Resolution', 'MktCalculatedInsight' => 'Calculated Insight', 'MktSegment' => 'Segment', 'MktSegmentActivation' => 'Activation'};

    public static void notifyUsers(Set<String> recipientsIds, String targetId, String notifTitle, String notifBody) {

        //Get the Id for our custom notification type
        CustomNotificationType notificationType = 
            [SELECT Id, DeveloperName 
             FROM CustomNotificationType 
             WHERE DeveloperName='Deployment_Notification_for_DC_Alerts'];
        
        //Create a new custom notification
        Messaging.CustomNotification notification = new Messaging.CustomNotification();

        //Set the contents for the notification
        notification.setTitle(notifTitle);
        notification.setBody(notifBody);

        //Set the notification type and target
        notification.setNotificationTypeId(notificationType.Id);

        //TODO: Doesn't work to navigate to a setup page, gives an apex error. Minimum of a targetId is required, but clicking it takes to a 'page not found'
        //notification.setTargetId(targetId);
        //PageReference pageRef = new PageReference(baseUrl + '/lightning/setup/DeployStatus/page?address=%2Fchangemgmt%2FmonitorDeploymentsDetails.apexp%3FasyncId%3D' + targetId + '%26retURL%3D%252Fchangemgmt%252FmonitorDeployment.apexp');
        //System.debug('pageRef.getUrl(): ' + String.valueOf(pageRef.getUrl()));
        //notification.setTargetPageRef(String.valueOf(pageRef.getUrl()));

        //Workaround, which does work, however it generates a JS console error which might cause issues later...
        String baseUrl = System.Url.getOrgDomainUrl().toExternalForm();
        Map<String, Object> pageRef = new Map<String, Object>{
            'type' => 'standard__webPage',
            'attributes' => new Map<String, Object> {
                'url' => baseUrl + '/lightning/setup/DeployStatus/page?address=%2Fchangemgmt%2FmonitorDeploymentsDetails.apexp%3FasyncId%3D' + targetId + '%26retURL%3D%252Fchangemgmt%252FmonitorDeployment.apexp'
            }
        };
        notification.setTargetPageRef(JSON.serialize(pageRef)); 
        
        //Actually send the notification
        try {
            notification.send(recipientsIds);
        }
        catch (Exception e) {
            System.debug('Problem sending notification: ' + e.getMessage());
        }
    }

    //Publish a Platform Event with the result. The deployMetadata LWC will display the result in a toast message.
    public void handleResult(Metadata.DeployResult result, Metadata.DeployCallbackContext context) {
        
        Integer failureCount = Integer.valueOf(result.numberComponentErrors);
        String deploymentStatus = 'Deployment ' + String.valueOf(result.status);
        String recordId = result.id;
        String message;
        
        DeploymentStatusCallback__e callbackMessage = new DeploymentStatusCallback__e(
            RecordId__c = recordId, 
            Status__c = deploymentStatus,
            Failure_Count__c = failureCount
        );
        EventBus.publish(callbackMessage);

        //Send a custom notification bell to tell the user the deployment has completed.
        Set<String> userIds = new Set<String>();
        userIds.add(result.createdBy);

        if(deploymentStatus == 'Deployment Succeeded') {
            message = 'The deployment with Job Id ' + recordId + ' completed successfully.';
        }
        else {
            String failureMessage = failureCount > 1 ? 'records' : 'record';
            message = 'The deployment with Job Id ' + recordId + ' failed. ' + failureCount + ' ' + failureMessage + '  failed to deploy. Please review the Deployment Status in Setup for full details.';
        }
        
        notifyUsers(userIds, result.Id, deploymentStatus, message);
    }

    //Process a list of the Data Cloud Metadata into Custom Metadata Types.
    private static void buildMetadataForDeployment(List<SObject> records, Map<String,Object> formValues) {
        
        deployRequired = true;

        for(SObject record : records) {
            String objectType = typeMap.get(record.getSObjectType().getDescribe().getName());
            Map<String, Object> fieldWithValuesMap = new Map<String, Object>();
            Metadata.CustomMetadata customMetadata =  new Metadata.CustomMetadata();
            customMetadata.fullName = 'Data_Cloud_Notification_Feature.' + String.valueOf(record.get('Name')).replace(' ', '_');
            customMetadata.label = String.valueOf(record.get('Name'));

            //Field values set by using the record being processed.
            fieldWithValuesMap.put('Data_Cloud_Record_Name__c', String.valueOf(record.get('Name')));
            fieldWithValuesMap.put('Data_Cloud_Type__c', objectType);

            //The rest are default values submitted from the form.
            for(String fieldName : formValues.keySet()) {
                if(fieldName != 'typesToDeploy' && fieldName != 'Notification_Body__c') {
                    fieldWithValuesMap.put(fieldName, formValues.get(fieldName));
                }
                else if(fieldName == 'Notification_Body__c') { //Find and replace the tag with the record name.
                    String replacedValue = String.valueOf(formValues.get(fieldName)).replace('{recordName}', String.valueOf(record.get('Name')));
                    fieldWithValuesMap.put('Notification_Body__c', replacedValue);
                }
            }

            for(String key : fieldWithValuesMap.keySet()){
                Metadata.CustomMetadataValue customField = new Metadata.CustomMetadataValue();
                customField.field = key;
                customField.value = fieldWithValuesMap.get(key); 
                customMetadata.values.add(customField);
            }
            mdContainer.addMetadata(customMetadata);
        }        
    }

    @AuraEnabled
    public static Id newSetup(String formInputs) {

        //try {
            List<SObject> metadataToDeploy = new List<SObject>();
            Map<String, Object> formValues = (Map<String,Object>) JSON.deserializeUntyped(formInputs);
            String typesToDeploy = String.valueOf(formValues.get('typesToDeploy'));
            //System.debug('typesToDeploy: ' + typesToDeploy);

            //Build a list of the records to deploy.
            //NOTE: The typesToDeploy string is a semi-colon separated list of the SObject names from multiple check boxes on the UI
            //The query is built dynamically based on the selected types. Whilst this is in a loop, it is limited to 7 queries.
            //Doing it like this makes things much easier to create a Test Classes and add new types in the future.
            if(typesToDeploy.length() > 0) {
                //System.debug('In here: ' + typesToDeploy.length());
                for(String recordType : typesToDeploy.split(';')) {
                    //System.debug('Processing: ' + recordType);
                    for(SObject records : Database.query('SELECT Id, Name FROM ' + recordType)) {
                        //System.debug('records: ' + records);
                        metadataToDeploy.add(records);
                    }
                }
            }

            if(!metadataToDeploy.isEmpty()) {
                System.debug('Metadata to Deploy List:' + metadataToDeploy);
                buildMetadataForDeployment(metadataToDeploy, formValues);
            }

            //NOTE: Use a boolean flag, the Metadata Deployment class doesn't support size() or isEmpty().
            if(deployRequired) {
                processMetadataForDCAlerts callback = new processMetadataForDCAlerts();
                return Metadata.Operations.enqueueDeployment(mdContainer, callback);
            }
            else { 
                throw new AuraHandledException('No alerts to deploy for the selected Data Cloud metadata types.');
            }
        //}
        //catch(Exception e) {
        //    throw new AuraHandledException('No alerts to deploy for the selected Data Cloud metadata types.');
        //}
    }

    @AuraEnabled
    public static Id parseChangedMetadata(String jsonString){        
        try {
            List<SObject> changesToDeploy = new List<SObject>();
            String result = '{"data":' + jsonString + '}';
            Map<String, Object> changedRecords = (Map<String, Object>) JSON.deserializeUntyped(result);        
            List<Object> dataObj = (List<Object>) changedRecords.get('data');        
            
            for(Object obj : dataObj){
                Map<String, Object> dataMap = (Map<String, Object>) obj;

                Map<String, Object> fieldWithValuesMap = new Map<String, Object>();
                Metadata.CustomMetadata customMetadata =  new Metadata.CustomMetadata();
                customMetadata.fullName = 'Data_Cloud_Notification_Feature.' + String.valueOf(dataMap.get('data_cloud__Data_Cloud_Record_Name__c')).replace(' ', '_');
                customMetadata.label = String.valueOf(dataMap.get('data_cloud__Data_Cloud_Record_Name__c'));

                for (String fieldName : dataMap.keySet()){
                    
                    if(fieldName == 'data_cloud__Enable_Notifications__c') {
                        fieldWithValuesMap.put(fieldName, Boolean.valueOf(dataMap.get(fieldName)));
                    }
                    else {
                        fieldWithValuesMap.put(fieldName, String.valueOf(dataMap.get(fieldName)));
                    }
                    
                    //Clear out the email template name if using Notification Bells or clear out the Title/Body if using email, this drives the validation logic on the datatable.
                    if(fieldName == 'data_cloud__Notification_Type__c') {
                    
                        if(String.valueOf(dataMap.get(fieldName)) == 'Notification Bell') {
                            fieldWithValuesMap.put('data_cloud__Notification_Template_Name__c', '');
                        }
                        else {
                            fieldWithValuesMap.put('data_cloud__Notification_Title__c', '');
                            fieldWithValuesMap.put('data_cloud__Notification_Body__c', '');
                        }
                    }
                }

                for(String key : fieldWithValuesMap.keySet()){
                    Metadata.CustomMetadataValue customField = new Metadata.CustomMetadataValue();
                    customField.field = key;
                    customField.value = fieldWithValuesMap.get(key); 
                    customMetadata.values.add(customField);
                }
                mdContainer.addMetadata(customMetadata);             
            }

            processMetadataForDCAlerts callback = new processMetadataForDCAlerts();
            return Metadata.Operations.enqueueDeployment(mdContainer, callback);
        
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, List<String>> getPicklistValues(String objectName, String picklistFieldNames) {
        Map<String, List<String>> picklistFieldAndValues = new Map<String, List<String>>();
        
        Map<String, Object> picklistFields = (Map<String, Object>) JSON.deserializeUntyped(picklistFieldNames);
        List<Object> plf = (List<Object>) picklistFields.get('fields');
    
        for(Object pl: plf) {
            DescribeSObjectResult objResult = Schema.getGlobalDescribe().get(objectName).getDescribe();
            DescribeFieldResult fieldResult = objResult.fields.getMap().get(String.valueOf(pl)).getDescribe();
            List<String> picklistValues = new List<String>();

            for(Schema.PicklistEntry pickVal : fieldResult.getPicklistValues()) {
                picklistValues.add(pickval.getValue());
            }
            picklistFieldAndValues.put(String.valueOf(pl), picklistValues);
        }
        return picklistFieldAndValues;
    }

    /**
     * 
     */
    @AuraEnabled(cacheable=true)
    public static List<Data_Cloud_Notification_Feature__mdt> getMetadata(Boolean loadedPicklist, Integer offsetRecords, Integer limitRecords) {
        
        List<Data_Cloud_Notification_Feature__mdt> metadataRecords = new List<Data_Cloud_Notification_Feature__mdt>();
        
        for(Data_Cloud_Notification_Feature__mdt record : 
                    [SELECT Id,MasterLabel,DeveloperName,Data_Cloud_Record_Name__c,
                    Data_Cloud_Type__c, Enable_Notifications__c, Notification_Body__c, Notification_Frequency__c, Notification_Title__c, Notification_Type__c, 
                    Permission_Set_Name__c, Notification_Template_Name__c
                    FROM Data_Cloud_Notification_Feature__mdt
                    ORDER BY Data_Cloud_Type__c]) {
            metadataRecords.add(record);
        }

        return metadataRecords;
    }
}