import { LightningElement,api,track} from 'lwc';

export default class Toggeltype extends LightningElement {
   
    @api value;
    @api context;
    @track togglevalue;

    renderedCallback() {
        this.togglevalue = this.value;
    }

    handleChange(event) {
        
    event.preventDefault();
        
    let value = event.target.checked;
    this.value = value;
    this.togglevalue = value;

    const toggle = new CustomEvent('toggleselect', {
        composed:true,
        bubbles: true,
        cancelable: true,
        detail: {
            data: { context: this.context, value: this.value }
        }
        
    });
    this.dispatchEvent(toggle);

    }
}