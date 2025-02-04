import { LightningElement, wire, track, api } from 'lwc';
import getMetadata from '@salesforce/apex/processMetadataForDCAlerts.getMetadata';
import parseChangedMetadata from '@salesforce/apex/processMetadataForDCAlerts.parseChangedMetadata';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { subscribe, unsubscribe } from 'lightning/empApi';
import { refreshApex } from '@salesforce/apex';
import getPicklistValues from '@salesforce/apex/processMetadataForDCAlerts.getPicklistValues'

const columns = [
    { label: 'Data Cloud Name', fieldName: 'data_cloud__Data_Cloud_Record_Name__c', displayReadOnlyIcon: true },
    { label: 'Data Cloud Type', fieldName: 'data_cloud__Data_Cloud_Type__c', displayReadOnlyIcon: true },
    {
        label: 'Type', fieldName: 'data_cloud__Notification_Type__c', type: 'customPicklist', editable: true,
        typeAttributes: {
            options: { fieldName: 'picklistOptionsType' },
            value: { fieldName: 'data_cloud__Notification_Type__c' },
            context: { fieldName: 'data_cloud__Data_Cloud_Record_Name__c' }
        }
    },
    {
        label: 'Frequency', fieldName: 'data_cloud__Notification_Frequency__c', type: 'customPicklist', editable: true,
        typeAttributes: {
            options: { fieldName: 'picklistOptionsFrequency' },
            value: { fieldName: 'data_cloud__Notification_Frequency__c' },
            context: { fieldName: 'data_cloud__Data_Cloud_Record_Name__c' }
        }
    },
    { label: 'Title', fieldName: 'data_cloud__Notification_Title__c', editable: true },
    { label: 'Body', fieldName: 'data_cloud__Notification_Body__c', wrapText: true, editable: true },
    { label: 'Email Template Name', fieldName: 'data_cloud__Notification_Template_Name__c', editable: true },
    { label: 'Permission Set to Notify', fieldName: 'data_cloud__Permission_Set_Name__c', editable: true },
    {
        label: 'Enabled?', fieldName: 'data_cloud__Enable_Notifications__c', type: 'customToggle',
        typeAttributes: {
            value: { fieldName: 'data_cloud__Enable_Notifications__c' },
            context: { fieldName: 'data_cloud__Data_Cloud_Record_Name__c' },
        }
    }
];

export default class DisplayMetadataforDCAlerts extends LightningElement {

    @track _wiredResult;
    @track data = [];
    @track errors = {};
    @track picklistOptionsFrequency;
    @track picklistOptionsType;
    @track loadedPicklist;

    @api noRecords = false;

    @api
    get showTable() {
        if (this.data.length > 0) {
            return true;
        }
        return false;
    }

    showFilters = false;
    @api
    get loadFilters() {
        if (this.showFilters) {
            return true;
        }
        return false;
    }

    get optionsDCType() {
        return [
            { label: 'Data Stream', value: 'DataStream' },
            { label: 'Data Transform', value: 'MktDataTransform' },
            { label: 'Identity Resolution', value: 'IdentityResolution' },
            { label: 'Calculated Insight', value: 'MktCalculatedInsight' },
            { label: 'Segments', value: 'MarketSegment' },
            { label: 'Activations', value: 'MarketSegmentActivation' }
        ];
    }

    get optionsNotifType() {
        return [
            { label: 'Notification Bell', value: 'Notification Bell' },
            { label: 'Email', value: 'Email' }
        ];
    }
    
    columns = columns;
    saveDraftValues = [];
    mergedData = [];
    picklistValsType = [];
    picklistValsFrequency = [];
    channelName = '/event/data_cloud__DeploymentStatusCallback__e';
    subscription = {};
    showSpinner = true;
    
    filters = [
        { label: 'Data Cloud Type', type: 'picklist', api: 'data_cloud__Data_Cloud_Type__c' },
        { label: 'Notification Type', type: 'picklist', api: 'data_cloud__Notification_Type__c' },
        { label: 'Notification Frequency', type: 'picklist', api: 'data_cloud__Notification_Frequency__c' }
    ];

    connectedCallback() {
        this.showSpinner = true;

        var fields = {'fields': ['data_cloud__Notification_Frequency__c', 'data_cloud__Notification_Type__c']};
        getPicklistValues({ objectName: 'data_cloud__Data_Cloud_Notification_Feature__mdt', picklistFieldNames: JSON.stringify(fields)}).then(fields => {
            for(var field in fields) {
                let values = fields[field];
                values.forEach(value => {
                    if(field == 'data_cloud__Notification_Type__c') {
                        this.picklistValsType.push({ label: value, value: value });
                    }
                    else {  
                        this.picklistValsFrequency.push({ label: value, value: value });
                    }
                })
            }
            this.picklistOptionsType = this.picklistValsType;
            this.picklistOptionsFrequency = this.picklistValsFrequency;
            this.loadedPicklist = true;
        }).catch(error => {
            console.log('Error retrieving the picklist vals: ' + error);
        });   
    }

    _showToastEvent(variant, title, message) {
        const event = new ShowToastEvent({
            title,
            message,
            variant
        });
        this.dispatchEvent(event);
    }

    //Subscribe to a Platform event when a deployment is scheduled
    _handleSubscribe() {

        //Callback invoked whenever a new event message is received, it contains the payload of the new message received
        const messageCallback = response => {
            //console.log('New message received: ', JSON.stringify(response));
            var jsonArray = Array.from(Object.values(response));
            var recordId = jsonArray[0].payload.data_cloud__RecordId__c;
            var deploymentStatus = jsonArray[0].payload.data_cloud__Status__c;
            var failureCount = jsonArray[0].payload.data_cloud__Failure_Count__c;
            console.log('deployment status was: ' + deploymentStatus);
            if (deploymentStatus == 'Deployment Succeeded') {
                this._showToastEvent('success', deploymentStatus, 'The deployment with Job Id ' + recordId + ' completed successfully.');
            }
            else {
                var failureMessage = failureCount > 1 ? 'records' : 'record';
                this._showToastEvent('error', deploymentStatus, 'The deployment with Job Id ' + recordId + ' failed. ' + failureCount + ' ' + failureMessage + '  failed to deploy. Please review the Deployment Status in Setup for full details.');
            }

            refreshApex(this._wiredResult).then(() => { //Refresh the cached data.
                console.log('Apex data refreshed');
            })
            .catch(error => {
                console.error('Error refreshing data table values: ', error);
            });

            this._handleUnsubscribe();
        };

        //Invoke subscribe method of empApi. Pass reference to messageCallback
        subscribe(this.channelName, -1, messageCallback).then((response) => {
            //console.log('Subscription request sent to: ', JSON.stringify(response.channel)); //Response contains the subscription information on subscribe call
            this.subscription = response;
        });
    }

    //Handles unsubscribe after receiving an event
    _handleUnsubscribe() {
        unsubscribe(this.subscription, (response) => {
            //console.log('unsubscribe() response: ', JSON.stringify(response)); // Response is true for successful unsubscribe
        });
    }

    handleToggleSelect(event) {
        event.stopPropagation();
        let toggleid = event.detail.data.context;
        let toggleValue = event.detail.data.value;
        let updatedItem = { data_cloud__Data_Cloud_Record_Name__c: toggleid, data_cloud__Enable_Notifications__c: toggleValue };
        this.updateDraftValuesAndData(updatedItem);
        this.updateColumnData(updatedItem);
    }

    //Update draft values to trigger the Save/Cancel footer.
    updateDraftValuesAndData(updateItem) {
        let draftValueChanged = false;
        let copyDraftValues = [...this.saveDraftValues];

        copyDraftValues.forEach(item => {
            if (item.data_cloud__Data_Cloud_Record_Name__c === updateItem.data_cloud__Data_Cloud_Record_Name__c) {
                for (let field in updateItem) {
                    item[field] = updateItem[field];
                }
                draftValueChanged = true;
            }
        });

        if (draftValueChanged) {
            this.saveDraftValues = [...copyDraftValues];
        } else {
            this.saveDraftValues = [...copyDraftValues, updateItem];
        }
    }

    //Update retrieved data with the changed checkbox value. 
    updateColumnData(updatedItem) {
        let copyData = JSON.parse(JSON.stringify(this.data));

        copyData.forEach(item => {
            if (item.data_cloud__Data_Cloud_Record_Name__c === updatedItem.data_cloud__Data_Cloud_Record_Name__c) {
                for (let field in updatedItem) {
                    item[field] = updatedItem[field];
                }
            }
        });

        this.data = [...copyData];
    }

    errorHandler(title, messages, fieldNames) {
        let rowError = {};
        rowError['title'] = title;
        rowError['messages'] = messages;
        rowError['fieldNames'] = fieldNames;
        return rowError;
    }

    //Save the changed records by scheduling a deployment.
    handleSave(event) {

        //Merge the draft data with rest of the row. We can then use it for error handling.
        this.mergedData = this.data.map((record) => (
            {
            ...record, 
            ...(event.detail.draftValues.find((value) => value.data_cloud__Data_Cloud_Record_Name__c === record.data_cloud__Data_Cloud_Record_Name__c)|| {})
            }
        ));

        //Custom Error handling. Yuck!
        this.errors = {};
        let rowError = {};
        let title = 'Error';
        let messages = [];
        let fieldNames = [];
        
        this.mergedData.forEach(item => {
            
            //The notification type of email needs an email template. If blank, error the row.
            if (item.data_cloud__Notification_Type__c == 'Email' && item.data_cloud__Notification_Template_Name__c === undefined || item.data_cloud__Notification_Template_Name__c == '') {
                fieldNames = ['data_cloud__Notification_Template_Name__c'];
                messages = ['An email template must be specified for email type notifications'];
                rowError[item.data_cloud__Data_Cloud_Record_Name__c] = this.errorHandler(title, messages, fieldNames);
                this.errors['rows'] = rowError;
            }

            //The Notification Type of Notification needs title/body. If either are blank, error the row.
            if (item.data_cloud__Notification_Type__c == 'Notification Bell') {
                messages = [];
                fieldNames = [];
                if (item.data_cloud__Notification_Title__c == '' || item.data_cloud__Notification_Title__c === undefined) {
                    fieldNames.push('data_cloud__Notification_Title__c');
                    messages.push('A notification title must be specified for email type notifications');
                    rowError[item.data_cloud__Data_Cloud_Record_Name__c] = this.errorHandler(title, messages, fieldNames);
                    this.errors['rows'] = rowError;
                }

                if (item.data_cloud__Notification_Body__c == '' || item.data_cloud__Notification_Body__c === undefined) {
                    fieldNames.push('data_cloud__Notification_Body__c');
                    messages.push('A notification body must be specified for email type notifications');
                    rowError[item.data_cloud__Data_Cloud_Record_Name__c] = this.errorHandler(title, messages, fieldNames);
                    this.errors['rows'] = rowError;
                }
            }
        });

        //Only schedule a deployment if there is no validation errors.
        if (Object.keys(this.errors).length === 0 && this.errors.constructor === Object) {
            this.showSpinner = true;
            this._handleSubscribe();
            parseChangedMetadata({ jsonString: JSON.stringify(event.detail.draftValues)}).then(result => {
                this.saveDraftValues = [];
                this.data = this.mergedData;
                this._showToastEvent('success', 'Deployment Scheduled', 'The Deployment Job Id is ' + result + '. You will be notified when the deployment completes.');
            }).catch(error => {
                this._showToastEvent('error', 'Deployment Failed', error.body.message);
                this._handleUnsubscribe();
            });
            this.showSpinner = false;
        }
    }

    handleFilter(event) {
        this.data = event.detail.data;
    }

    //Add the picklist values to the rows of data before outputting it to the datatable.
    addPicklistVals(tempData) {
        return tempData.map((curItem) => {
            let type =  this.picklistValsType;
            let freq = this.picklistValsFrequency;

            return {
                ...curItem, 
                picklistOptionsType: type,
                picklistOptionsFrequency: freq
            }
        });
    }

    //Load the metadata into the data table.
    //Pass a dud reactive variable to stop the wire trying to load data before we have the confirmed picklist values, otherwise the picklist options aren't loaded properly.
    @wire(getMetadata, {loadedPicklist: '$loadedPicklist'})
    wiredMetadata(result) {
        this._wiredResult = result;
        if (result.data) {
            this.showFilters = true;
            this.data = this.addPicklistVals(result.data);

            if (result.data.length === 0) {
                this.noRecords = true;
            }

            this.showSpinner = false;
        }
        else if (result.error) {
            console.log('Error loading data for table: ' + result.error);
            this.data = undefined;
        }
    }
}