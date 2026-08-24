Blocking confirmation or short form.

```jsx
<Dialog open={open} onClose={close} title="Reboot 6 gateways?"
  description="Devices go offline for about 40 seconds."
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger">Reboot</Button></>} />
```
