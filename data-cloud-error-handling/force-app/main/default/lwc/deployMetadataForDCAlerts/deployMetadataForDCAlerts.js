import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import newSetup from '@salesforce/apex/processMetadataForDCAlerts.newSetup';
import { subscribe, unsubscribe } from 'lightning/empApi';

export default class DeployMetadataForDCAlerts extends LightningElement {

    @api defaultButtonLabel = 'Deploy Alert Configuration';
    @api defaultButtonWaitingLabel = 'Deploying. Please Wait..';

    anyServerError = false;
    serverErrorMessage = null;
    showSpinner = false;
    buttonLabel = '';
    channelName = '/event/data_cloud__DeploymentStatusCallback__e';
    subscription = {};
    formInputs = {};
    
    defaultValues;
    value = [];

    get isButtonDisabled() {
        if(this.value.length > 0) {
            return false;
        }
        return true;
    }

    get optionsType() {
        return [
            { label: 'Notification Bell', value: 'Notification Bell' },
            { label: 'Email', value: 'Email' }
        ];
    }

    get optionsFrequency() {
        return [
            { label: 'First Error', value: 'First Error' },
            { label: 'All Errors', value: 'All Errors' }
        ]
    }

    emailType = false;
    get showTemplateField() {
        return this.emailType;
    }

    get options() {
        return [
            {label: 'Data Stream', value: 'DataStream'},
            {label: 'Data Transform', value: 'MktDataTransform'},
            {label: 'Identity Resolution', value: 'IdentityResolution'},
            {label: 'Calculated Insight', value: 'MktCalculatedInsight'},
            {label: 'Segments', value: 'MarketSegment'},
            {label: 'Activations', value: 'MarketSegmentActivation'}
        ];
    }

    _showToastEvent(variant, title, message) {
        const event = new ShowToastEvent({
            title,
            message,
            variant
        });
        this.dispatchEvent(event);
    }

    connectedCallback() {
        this.handleSubmit(false, this.defaultButtonLabel);
    }

    renderedCallback() {
        //Get all elements on the page, and put the defaults in the formInputs. This is so that the values are submitted if the user doesn't change the defaults.
        let elements = this.template.querySelectorAll('lightning-input, lightning-combobox, lightning-textarea');
        elements.forEach(element => {
            this.formInputs[element.name] = element.type === 'toggle' ? element.checked : element.value.trim();
        })
    }
    
    _resetServerError() {
        this.anyServerError = false;
        this.serverErrorMessage = null;
    }

    _setServerError(errorMessage){
        this.anyServerError = true;
        this.serverErrorMessage = errorMessage;
    }

    handleSubmit(spinnerState, buttonText) {
        this.showSpinner = spinnerState;
        this.buttonLabel = buttonText;
    }

    handleChange(event) {
        if(Array.isArray(event.target.value)) { //Deal with Checkbox groups.
            this.formInputs[event.target.name] = event.target.value.join(',');
            this.value = event.target.value;
        }
        else {
            this.formInputs[event.target.name] = event.target.type === 'checkbox' ? event.target.checked : event.target.value.trim();  
        }

        if(event.target.name == 'Notification_Type__c') {
            switch (event.target.value) {
                case 'Email':
                    this.emailType = true;
                    break;
                default:
                    this.emailType = false;
            }
        }
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
            if(deploymentStatus == 'Deployment Succeeded') {
                this._showToastEvent('success', deploymentStatus, 'The deployment with Job Id ' + recordId + ' completed successfully.');
            }
            else {
                var failureMessage = failureCount > 1 ? 'components' : 'component';
                this._showToastEvent('error', deploymentStatus, 'The deployment with Job Id ' + recordId + ' failed. ' + failureCount + ' ' + failureMessage + '  failed to deploy. Please review the Deployment Status in Setup for full details.');
            }
            this._handleUnsubscribe();
            this.showSpinner = false;
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

    handleDeploy() {
        this._resetServerError();
        this._handleSubscribe();
        this.handleSubmit(true, this.defaultButtonWaitingLabel);
        newSetup({formInputs: JSON.stringify(this.formInputs)}).then(result => {
            this.handleSubmit(false, this.defaultButtonLabel);
            this._showToastEvent('success', 'Deployment Scheduled', 'The Deployment Job Id is ' + result + '. You will be notified when the deployment completes.');
        }).catch(error => {
            this._setServerError(error.body.message);
            this.handleSubmit(false, this.defaultButtonLabel);
            this._showToastEvent('error', 'Deployment Failed', error.body.message);
            this._handleUnsubscribe();
        });
        this.value = [];
    }
}